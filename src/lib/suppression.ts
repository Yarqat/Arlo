import { prisma } from "./db";
import { normalizeEmail } from "./dedup";
import { audit } from "./audit";
import { SuppressionReason } from "@prisma/client";

export async function isSuppressed(email: string): Promise<boolean> {
  const rec = await prisma.suppressionRecord.findUnique({ where: { email: normalizeEmail(email) } });
  return !!rec;
}

export async function suppressedSet(emails: string[]): Promise<Set<string>> {
  const norm = emails.map(normalizeEmail);
  const rows = await prisma.suppressionRecord.findMany({ where: { email: { in: norm } }, select: { email: true } });
  return new Set(rows.map((r) => r.email));
}

/**
 * Permanently suppress an address: record it (idempotent, never auto-reactivated)
 * and cancel every queued send/follow-up to that address across ALL campaigns.
 */
export async function suppress(input: {
  email: string;
  reason: SuppressionReason;
  source: string;
  detail?: string;
}): Promise<void> {
  const email = normalizeEmail(input.email);

  await prisma.suppressionRecord.upsert({
    where: { email },
    // Keep the ORIGINAL reason/source on conflict — do not downgrade or reactivate.
    create: { email, reason: input.reason, source: input.source, eventDetail: input.detail ?? "" },
    update: {},
  });

  const contacts = await prisma.contact.findMany({ where: { email }, select: { id: true } });
  const contactIds = contacts.map((c) => c.id);
  if (contactIds.length) {
    await prisma.scheduledAction.updateMany({
      where: {
        contactId: { in: contactIds },
        type: { in: ["SEND_OUTREACH", "FOLLOW_UP", "DRAFT_OUTREACH"] },
        status: { in: ["SCHEDULED", "PAUSED", "BLOCKED"] },
      },
      data: { status: "CANCELLED", blockedReason: `suppressed:${input.reason}` },
    });
  }

  await audit("system", "suppress", "Suppression", email, `Suppressed ${email} (${input.reason})`, {
    source: input.source,
    detail: input.detail,
  });
}

export async function unsubscribeByToken(token: string): Promise<{ ok: boolean; email?: string }> {
  const contact = await prisma.contact.findUnique({ where: { unsubscribeToken: token } });
  if (!contact) return { ok: false };
  await suppress({ email: contact.email, reason: "UNSUBSCRIBE", source: "link", detail: "one-click unsubscribe" });
  return { ok: true, email: contact.email };
}
