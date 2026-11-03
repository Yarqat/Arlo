import { prisma } from "./db";
import { getSettings } from "./settings";
import { dayKey } from "./time";

export type StatusTone = "danger" | "warning" | "info";

export interface PipelineBlocker {
  key: string;
  tone: StatusTone;
  title: string;
  detail: string;
}

/**
 * Explains WHY the pipeline may not be moving, in plain language the owner can
 * act on. Returns an empty array when everything is healthy, so the UI stays
 * quiet until there is something real to say.
 *
 * This is the user-facing counterpart to the budget guards in budget.ts: when a
 * daily cap is hit the worker silently stops advancing leads, and without this
 * the only evidence is the server log.
 */
export async function getPipelineStatus(): Promise<PipelineBlocker[]> {
  const settings = await getSettings();
  const tz = settings.timezone;
  const day = dayKey(tz);
  const resetsAt = `Resets at midnight (${tz}).`;
  const blockers: PipelineBlocker[] = [];

  // 1) Emergency pause — the hard stop the owner set themselves.
  if (settings.emergencyPause) {
    blockers.push({
      key: "emergency-pause",
      tone: "danger",
      title: "Everything is paused",
      detail:
        "Emergency pause is on, so no leads are researched, drafted or sent. Turn it off to resume.",
    });
  }

  // 2) Daily budget caps (GLOBAL scope, today). reserved + spent = committed.
  const counters = await prisma.budgetCounter.findMany({
    where: { scope: "GLOBAL", day },
  });
  const used = (kind: string) => {
    const r = counters.find((c) => c.kind === kind);
    return r ? r.reservedCount + r.spentCount : 0;
  };
  const spent = () =>
    counters.reduce((s, c) => s + Number(c.reservedCost) + Number(c.spentCost), 0);

  const aiUsed = used("AI");
  if (aiUsed >= settings.dailyAiRequests) {
    blockers.push({
      key: "ai-limit",
      tone: "warning",
      title: "Daily AI limit reached",
      detail: `Arlo has used all ${settings.dailyAiRequests} AI actions for today, so researching and drafting are paused. ${resetsAt} Raise the limit in Settings if you need more.`,
    });
  }

  const researchUsed = used("RESEARCH");
  if (settings.dailyResearch > 0 && researchUsed >= settings.dailyResearch) {
    blockers.push({
      key: "research-limit",
      tone: "warning",
      title: "Daily research limit reached",
      detail: `Arlo has researched today's ${settings.dailyResearch} leads, so new leads can't be analysed or drafted until it resets. ${resetsAt} Raise the limit in Settings if you need more.`,
    });
  }

  const spendUsed = spent();
  const spendCap = Number(settings.dailySpendLimit);
  if (spendCap > 0 && spendUsed >= spendCap) {
    blockers.push({
      key: "spend-limit",
      tone: "warning",
      title: "Daily spend limit reached",
      detail: `Today's AI spend hit the $${spendCap.toFixed(2)} cap, so work is paused. ${resetsAt} Raise it in Settings if you need more.`,
    });
  }

  const emailUsed = used("EMAIL");
  if (settings.dailyEmail > 0 && emailUsed >= settings.dailyEmail) {
    blockers.push({
      key: "email-limit",
      tone: "info",
      title: "Today's emails are all sent",
      detail: `You've sent today's ${settings.dailyEmail} emails. Drafting continues; the rest go out tomorrow. ${resetsAt}`,
    });
  }

  // 3) Connected-API problems (expired credits, billing, bad key, rate limit)
  //    recorded by provider-alert.ts. Show the latest per provider so every
  //    affected API (AI model, mailbox, verifier…) gets its own warning.
  const since = new Date(Date.now() - 2 * 3600_000);
  const alerts = await prisma.auditEvent.findMany({
    where: { action: "provider_alert", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const seenProviders = new Set<string>();
  const label: Record<string, string> = { AI: "AI model", email: "Email sending", verifier: "Email verifier" };
  for (const a of alerts) {
    if (seenProviders.has(a.entityId)) continue;
    seenProviders.add(a.entityId);
    blockers.push({
      key: `provider-${a.entityId}`,
      tone: "danger",
      title: `${label[a.entityId] ?? a.entityId} — action needed`,
      detail: `${a.summary} Check Settings → Connections (credits, billing or API key).`,
    });
  }

  // 4) Active campaigns with no mailbox can research/draft but never send.
  const noMailbox = await prisma.campaign.count({
    where: { status: "ACTIVE", sendingMailboxId: null },
  });
  if (noMailbox > 0) {
    blockers.push({
      key: "no-mailbox",
      tone: "warning",
      title: noMailbox === 1 ? "A campaign has no mailbox" : `${noMailbox} campaigns have no mailbox`,
      detail:
        "Drafts are being written but can't be sent until you connect a sending mailbox to the campaign.",
    });
  }

  return blockers;
}
