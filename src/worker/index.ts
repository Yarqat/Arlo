import { Worker } from "bullmq";
import { connection } from "@/lib/redis";
import { env } from "@/lib/env";
import { QUEUE_NAMES, enqueue } from "@/lib/queue";
import { prisma } from "@/lib/db";
import { log } from "@/lib/log";
import { researchLead } from "@/lib/pipeline/research";
import { verifyLead } from "@/lib/pipeline/verify";
import { draftOutreach, sendMessage, scrubOutreach } from "@/lib/pipeline/outreach";
import { processFollowUp } from "@/lib/pipeline/followup";
import { discoverForCampaign } from "@/lib/pipeline/discover";
import { handleReply } from "@/lib/pipeline/reply";
import { syncMailbox } from "@/lib/pipeline/imap";
import { dayKey, hourInTz, fmtFull } from "@/lib/time";
import { runAiTask } from "@/lib/providers/ai";

const prefix = env().BULLMQ_PREFIX;
const base = { connection, prefix, concurrency: 2 };

function worker(name: string, fn: (data: any) => Promise<unknown>) {
  const w = new Worker(
    name,
    async (job) => {
      log.info("job start", { queue: name, job: job.name });
      const out = await fn(job.data);
      return out;
    },
    { ...base, concurrency: name === "research" || name === "outreach" ? 1 : 2, lockDuration: 120_000 },
  );
  w.on("failed", (job, err) => log.error("job failed", { queue: name, job: job?.name, err: err.message }));
  return w;
}

const workers = [
  worker(QUEUE_NAMES.research, async (d) => researchLead(d.leadId)),
  worker(QUEUE_NAMES.verify, async (d) => verifyLead(d.leadId)),
  worker(QUEUE_NAMES.outreach, async (d) => {
    if (d.action === "send") return sendMessage(d.messageId, { actor: d.actor ?? "worker" });
    return draftOutreach(d.leadId);
  }),
  worker(QUEUE_NAMES.followup, async (d) => processFollowUp(d.actionId)),
  worker(QUEUE_NAMES.discovery, async (d) => discoverForCampaign(d.campaignId, { limit: d.limit })),
  worker(QUEUE_NAMES.reply, async (d) => handleReply(d.messageId)),
  worker(QUEUE_NAMES.imap, async (d) => syncMailbox(d.mailboxId)),
];

// --- Personal assistant: fire due reminders + daily briefing ---
async function assistantTick(settings: { timezone?: string; dailyBriefingEnabled?: boolean; dailyBriefingHour?: number } | null) {
  const tz = settings?.timezone || "Asia/Karachi";
  try {
    // Due reminders → owner-facing notifications.
    const due = await prisma.reminder.findMany({ where: { status: "SCHEDULED", dueAt: { lte: new Date() } }, take: 20 });
    for (const r of due) {
      await prisma.assistantNotification.create({ data: { kind: "reminder", title: r.title, body: r.details } });
      await prisma.reminder.update({ where: { id: r.id }, data: { status: "FIRED", firedAt: new Date() } });
      log.info("reminder fired", { id: r.id });
    }

    // Daily briefing: once per local day, at/after the configured hour.
    if (settings?.dailyBriefingEnabled) {
      const today = dayKey(tz);
      if (hourInTz(tz) >= (settings.dailyBriefingHour ?? 8)) {
        const exists = await prisma.assistantNotification.findFirst({ where: { kind: "briefing", dayKey: today } });
        if (!exists) {
          const body = await buildBriefing(tz);
          await prisma.assistantNotification.create({ data: { kind: "briefing", title: `Daily briefing — ${today}`, body, dayKey: today } });
          log.info("daily briefing created", { day: today });
        }
      }
    }
  } catch (e) {
    log.error("assistant tick error", { err: (e as Error).message });
  }
}

async function buildBriefing(tz: string): Promise<string> {
  const [interested, replied, dueToday, sentCount] = await Promise.all([
    prisma.lead.count({ where: { stage: "INTERESTED" } }),
    prisma.lead.count({ where: { stage: "REPLIED" } }),
    prisma.reminder.findMany({ where: { status: { in: ["SCHEDULED", "FIRED"] } }, orderBy: { dueAt: "asc" }, take: 10 }),
    prisma.message.count({ where: { direction: "OUTBOUND", state: "SENT" } }),
  ]);
  const reminders = dueToday.map((r) => `- ${r.title} (${fmtFull(r.dueAt, tz)})`).join("\n") || "- none";
  const facts = `Interested leads: ${interested}. Awaiting your reply: ${replied}. Emails sent to date: ${sentCount}.\nUpcoming reminders:\n${reminders}`;
  try {
    const res = await runAiTask({
      task: "ASSISTANT",
      system: "Write a 3-4 sentence good-morning briefing for a solo founder from these CRM facts. Warm, concise, concrete. Use only the facts given; invent nothing.",
      messages: [{ role: "user", content: facts }],
      maxTokens: 300,
    });
    return `${res.text}\n\n${facts}`;
  } catch {
    return facts; // AI unavailable → still deliver the plain facts
  }
}

// --- Automation tick: deterministic orchestration (every 60s) ---
let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const settings = await prisma.globalSettings.findUnique({ where: { id: "singleton" } });

    // Reminders + daily briefing run regardless of emergency pause (not outbound).
    await assistantTick(settings);

    if (settings?.emergencyPause) return;

    // 1) Due follow-ups
    const due = await prisma.scheduledAction.findMany({
      where: { type: "FOLLOW_UP", status: "SCHEDULED", runAt: { lte: new Date() } },
      take: 20,
    });
    for (const a of due) await enqueue("followup", "run", { actionId: a.id });

    // 2) Mailbox sync (every ~2 min via modulo on minute)
    const minute = new Date().getMinutes();
    if (minute % 2 === 0) {
      const mailboxes = await prisma.mailbox.findMany({ where: { status: "CONNECTED", active: true } });
      for (const mb of mailboxes) await enqueue("imap", "sync", { mailboxId: mb.id });
    }

    // 3) Campaign pipeline for every ACTIVE campaign.
    //    Discovery/research/verify/draft are safe (no outbound) and run for ALL
    //    active campaigns so leads keep flowing without manual clicking. Only
    //    AUTOMATIC campaigns auto-send; APPROVE_FIRST/DRAFT_ONLY just prepare
    //    drafts for your review. All volume is capped by the daily lead/spend
    //    budgets (Settings → Budgets).
    const campaigns = await prisma.campaign.findMany({ where: { status: "ACTIVE" } });
    for (const c of campaigns) {
      // keep discovering roughly every 10 minutes while budget/room remains,
      // unless the owner turned off "keep finding new leads" for this campaign
      if (c.autoDiscover && (c.maxNewLeadsPerDay ?? 20) > 0 && minute % 10 === 3) {
        await enqueue("discovery", "discover", { campaignId: c.id, limit: c.maxNewLeadsPerDay ?? 20 });
      }

      // research NEW leads with a website
      const toResearch = await prisma.lead.findMany({
        where: { primaryCampaignId: c.id, stage: "NEW", website: { not: "" } },
        take: 10,
      });
      for (const l of toResearch) await enqueue("research", "research-lead", { leadId: l.id });

      // verify QUALIFIED leads lacking a fresh verification
      const toVerify = await prisma.lead.findMany({
        where: { primaryCampaignId: c.id, stage: "QUALIFIED", contacts: { some: { verifications: { none: {} } } } },
        take: 10,
      });
      for (const l of toVerify) await enqueue("verify", "verify-lead", { leadId: l.id });

      // draft for QUALIFIED leads with a deliverable contact and no draft yet
      const toDraft = await prisma.lead.findMany({
        where: {
          primaryCampaignId: c.id,
          stage: { in: ["QUALIFIED", "READY_FOR_REVIEW"] },
          // Normally require a deliverable contact; if the owner allows unverified
          // on this campaign, any contact is enough.
          contacts: c.allowUnverified ? { some: {} } : { some: { verifications: { some: { status: "DELIVERABLE" } } } },
          messages: { none: { direction: "OUTBOUND", followUpStep: 0 } },
        },
        take: 10,
      });
      for (const l of toDraft) await enqueue("outreach", "draft-lead", { leadId: l.id });

      // Auto-send ONLY for AUTOMATIC campaigns. Preflight enforces every guard
      // (suppression, verification, schedule, budgets). APPROVE_FIRST campaigns
      // leave drafts for the owner to approve on the campaign screen.
      if (c.outreachMode === "AUTOMATIC") {
        // QUEUED = previously blocked (e.g. outside hours); retry when eligible.
        const drafts = await prisma.message.findMany({
          where: { campaignId: c.id, direction: "OUTBOUND", state: { in: ["DRAFT", "QUEUED"] }, followUpStep: 0 },
          take: 15,
        });
        for (const m of drafts) {
          if (scrubOutreach(m.subject + "\n" + m.bodyText).clean) {
            await enqueue("outreach", "send", { action: "send", messageId: m.id });
          }
        }
      }
    }
  } catch (e) {
    log.error("tick error", { err: (e as Error).message });
  } finally {
    ticking = false;
  }
}

const interval = setInterval(tick, 60_000);
setTimeout(tick, 5_000);

log.info("worker started", { queues: Object.values(QUEUE_NAMES) });

async function shutdown() {
  clearInterval(interval);
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
