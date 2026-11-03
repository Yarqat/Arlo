import { prisma } from "./db";
import { audit } from "./audit";

// Error text that means the provider itself rejected us for money/auth reasons —
// the kind of failure the owner must act on (add credits, fix billing, fix key).
const CREDIT_RE =
  /(credit|billing|insufficient|quota|payment|unpaid|expired|balance|out of|over.?(the.?)?limit|too many requests|rate.?limit|unauthor|invalid[ _-]*(api)?[ _-]*key|forbidden|\b401\b|\b403\b|\b429\b|PENDING_BILLING)/i;

export function isProviderCreditError(msg: string): boolean {
  return CREDIT_RE.test(msg || "");
}

/**
 * Record a provider-side failure (expired credits, billing, bad key, rate limit)
 * so the dashboard can warn the owner. Deduped per provider to a single entry
 * every 10 minutes, so a retrying worker can't flood the activity log.
 */
export async function recordProviderAlert(provider: string, message: string): Promise<void> {
  try {
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const recent = await prisma.auditEvent.findFirst({
      where: { action: "provider_alert", entityId: provider, createdAt: { gte: since } },
    });
    if (recent) return;
    await audit("system", "provider_alert", "Provider", provider, message.slice(0, 300));
  } catch {
    // Alerting must never break the calling job.
  }
}
