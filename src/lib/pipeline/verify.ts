import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { reserve } from "@/lib/budget";
import { startVerification } from "@/lib/providers/verifier";
import { audit } from "@/lib/audit";
import { log } from "@/lib/log";

/** Verify all un-verified / stale contacts for a lead. */
export async function verifyLead(leadId: string): Promise<{ ok: boolean; verified: number; pending: number; reason?: string }> {
  const settings = await getSettings();
  const staleMs = settings.verificationStaleDays * 86400_000;
  const contacts = await prisma.contact.findMany({
    where: { leadId },
    include: { verifications: { orderBy: { checkedAt: "desc" }, take: 1 } },
  });
  let verified = 0;
  let pending = 0;
  for (const c of contacts) {
    const latest = c.verifications[0];
    // A recent result — including one still PENDING an async webhook — means we
    // do not resubmit; this also prevents duplicate submissions while waiting.
    if (latest && Date.now() - latest.checkedAt.getTime() < staleMs) continue;
    try {
      const r = await reserve({ kind: "VERIFICATION", estimatedCost: 0.004, estimatedCount: 1, reference: c.id, note: "email verify" });
      try {
        const outcome = await startVerification(c.email);
        await prisma.verificationResult.create({
          data: {
            contactId: c.id,
            provider: outcome.provider,
            status: outcome.status,
            externalId: outcome.externalId ?? null,
            isRoleAddress: outcome.isRoleAddress,
            isCatchAll: outcome.isCatchAll,
            isDisposable: outcome.isDisposable,
            score: outcome.score ?? null,
            raw: outcome.raw as object,
            staleAfter: new Date(Date.now() + staleMs),
          },
        });
        await r.commit(0.004, { count: 1, provider: outcome.provider });
        if (outcome.status === "PENDING") pending++;
        else verified++;
      } catch (e) {
        await r.release();
        throw e;
      }
    } catch (e) {
      log.error("verify failed", { contactId: c.id, err: (e as Error).message });
      return { ok: false, verified, pending, reason: (e as Error).message };
    }
  }
  const note = pending > 0 ? `Verified ${verified}, ${pending} awaiting async result` : `Verified ${verified} contact(s)`;
  await audit("worker", "verify", "Lead", leadId, note);
  return { ok: true, verified, pending };
}
