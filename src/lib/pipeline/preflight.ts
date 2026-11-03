import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { isSuppressed } from "@/lib/suppression";
import { hourInTz, weekdayInTz, dayKey, zonedWallToUtc } from "@/lib/time";
import { Mailbox, Campaign, Contact, Lead } from "@prisma/client";

export interface PreflightResult {
  ok: boolean;
  reason?: string;
  nextEligibleAt?: Date;
  // A permanent block can never clear by retrying (suppression, terminal stage),
  // so the message should be finalised rather than put back on the queue.
  permanent?: boolean;
}

const BLOCKED_STAGES = new Set(["SUPPRESSED", "LOST", "NOT_INTERESTED", "WON", "MEETING_BOOKED"]);

interface Ctx {
  lead: Lead;
  contact: Contact;
  campaign: Campaign | null;
  mailbox: Mailbox;
  isFollowUp: boolean;
}

/**
 * Deterministic gate run immediately before every send/follow-up. AI never
 * reaches here — these checks decide whether a message may leave.
 */
export async function preflight(ctx: Ctx): Promise<PreflightResult> {
  const settings = await getSettings();
  if (settings.emergencyPause) return { ok: false, reason: "Emergency pause is active" };

  // Suppression / unsubscribe / hard bounce (one list).
  if (await isSuppressed(ctx.contact.email)) return { ok: false, reason: "Address is suppressed (bounce/unsubscribe/manual)", permanent: true };

  // Lead stage.
  if (BLOCKED_STAGES.has(ctx.lead.stage)) return { ok: false, reason: `Lead stage is ${ctx.lead.stage}`, permanent: true };

  // A reply pauses everything — even before AI classification.
  const inboundSinceContact = await prisma.message.count({
    where: { leadId: ctx.lead.id, direction: "INBOUND" },
  });
  if (inboundSinceContact > 0 && ctx.isFollowUp) return { ok: false, reason: "A reply was received; follow-ups paused" };

  // Campaign status (automatic sends require an active campaign).
  if (ctx.campaign && ctx.campaign.status !== "ACTIVE") {
    return { ok: false, reason: `Campaign is ${ctx.campaign.status}` };
  }

  // Verification freshness, unless the campaign explicitly allows catch-all/unknown.
  const latest = await prisma.verificationResult.findFirst({
    where: { contactId: ctx.contact.id },
    orderBy: { checkedAt: "desc" },
  });
  const allowCatchAll = ctx.campaign?.allowCatchAll ?? false;
  const allowUnknown = ctx.campaign?.allowUnknown ?? false;
  const allowUnverified = ctx.campaign?.allowUnverified ?? false;
  // Owner override: send without a passing verification (e.g. no verifier set up).
  if (!allowUnverified) {
    if (!latest) return { ok: false, reason: "Contact is not verified" };
    const staleMs = settings.verificationStaleDays * 86400_000;
    if (Date.now() - latest.checkedAt.getTime() > staleMs) return { ok: false, reason: "Verification is stale; re-verify" };
    if (latest.status === "DELIVERABLE") {
      /* ok */
    } else if (latest.status === "CATCH_ALL" && allowCatchAll) {
      /* ok */
    } else if (latest.status === "UNKNOWN" && allowUnknown) {
      /* ok */
    } else {
      return { ok: false, reason: `Contact status ${latest.status} is not eligible for automatic sending` };
    }
  }

  // Sending schedule (business hours in campaign/mailbox timezone).
  const sched = (ctx.mailbox.sendingSchedule as any) || (ctx.campaign?.businessHours as any) || null;
  const tz = ctx.campaign?.timezone || settings.timezone;
  if (sched) {
    const day = weekdayInTz(tz);
    const hour = hourInTz(tz);
    const days: number[] = sched.days ?? [1, 2, 3, 4, 5];
    const start = parseInt((sched.start ?? "09:00").split(":")[0], 10);
    const end = parseInt((sched.end ?? "17:00").split(":")[0], 10);
    if (!days.includes(day) || hour < start || hour >= end) {
      const next = new Date();
      next.setHours(next.getHours() + 1);
      return { ok: false, reason: "Outside sending hours", nextEligibleAt: next };
    }
  }

  // Hourly mailbox limit (daily limit is enforced via the EMAIL budget reservation).
  const oneHourAgo = new Date(Date.now() - 3600_000);
  const sentLastHour = await prisma.message.count({
    where: { mailboxId: ctx.mailbox.id, direction: "OUTBOUND", sentAt: { gte: oneHourAgo }, state: { in: ["ACCEPTED", "SENT", "DELIVERED"] } },
  });
  if (sentLastHour >= ctx.mailbox.hourlyLimit) {
    const next = new Date(Date.now() + 3600_000);
    return { ok: false, reason: "Hourly sending limit reached", nextEligibleAt: next };
  }

  // Per-campaign sending caps (optional; null = no campaign-level cap, fall back
  // to the mailbox/global limits above). These let the owner throttle a single
  // campaign independently of the global budget.
  const tzForDay = ctx.campaign?.timezone || settings.timezone;
  const sentState = { in: ["ACCEPTED", "SENT", "DELIVERED"] as ("ACCEPTED" | "SENT" | "DELIVERED")[] };
  if (ctx.campaign?.hourlyEmailLimit != null) {
    const n = await prisma.message.count({
      where: { campaignId: ctx.campaign.id, direction: "OUTBOUND", sentAt: { gte: oneHourAgo }, state: sentState },
    });
    if (n >= ctx.campaign.hourlyEmailLimit) {
      return { ok: false, reason: "Campaign hourly limit reached", nextEligibleAt: new Date(Date.now() + 3600_000) };
    }
  }
  if (ctx.campaign?.dailyEmailLimit != null) {
    const [y, mo, d] = dayKey(tzForDay).split("-").map((x) => parseInt(x, 10));
    const startOfDay = zonedWallToUtc(y, mo, d, 0, 0, tzForDay);
    const n = await prisma.message.count({
      where: { campaignId: ctx.campaign.id, direction: "OUTBOUND", sentAt: { gte: startOfDay }, state: sentState },
    });
    if (n >= ctx.campaign.dailyEmailLimit) {
      // Next eligible at the start of tomorrow (campaign timezone).
      const next = new Date(startOfDay.getTime() + 24 * 3600_000);
      return { ok: false, reason: "Campaign daily limit reached", nextEligibleAt: next };
    }
  }

  return { ok: true };
}

export function todayKey(tz: string) {
  return dayKey(tz);
}
