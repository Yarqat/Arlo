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

// --- Automation tick: deterministic orchestration (every 60s) ---
let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const settings = await prisma.globalSettings.findUnique({ where: { id: "singleton" } });
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

    // 3) Automatic campaign pipeline
    const campaigns = await prisma.campaign.findMany({ where: { status: "ACTIVE", outreachMode: "AUTOMATIC" } });
    for (const c of campaigns) {
      // discover at most twice per hour (daily lead budget also caps volume)
      if (minute === 3 || minute === 33) {
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
          stage: { in: ["QUALIFIED"] },
          contacts: { some: { verifications: { some: { status: "DELIVERABLE" } } } },
          messages: { none: { direction: "OUTBOUND", followUpStep: 0 } },
        },
        take: 10,
      });
      for (const l of toDraft) await enqueue("outreach", "draft-lead", { leadId: l.id });

      // send clean step-0 drafts (AUTOMATIC only). Preflight enforces all guards.
      // QUEUED = previously blocked (e.g. outside hours); retry when eligible again.
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
