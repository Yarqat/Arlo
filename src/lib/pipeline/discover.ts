import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { reserve, BudgetExceededError } from "@/lib/budget";
import { runSearch } from "@/lib/providers/search";
import { safeFetch } from "@/lib/net/safe-fetch";
import { importLeads, LeadRecord } from "@/lib/leads";
import { enqueue } from "@/lib/queue";
import { audit } from "@/lib/audit";
import { log } from "@/lib/log";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JUNK = /(example\.com|sentry|\.png|\.jpg|\.gif|@2x|wixpress|yourdomain|domain\.com|email@)/i;

/** Extract PUBLIC emails actually published on the homepage/contact page. Never guessed. */
async function extractPublicEmails(website: string): Promise<string[]> {
  const base = website.startsWith("http") ? website : `https://${website}`;
  const found = new Set<string>();
  const candidates = [base, base.replace(/\/$/, "") + "/contact", base.replace(/\/$/, "") + "/contact-us"];
  for (const url of candidates) {
    try {
      const res = await safeFetch(url, { maxBytes: 800_000, timeoutMs: 10000 });
      if (res.status >= 400) continue;
      for (const m of res.body.matchAll(EMAIL_RE)) {
        const e = m[0].toLowerCase();
        if (!JUNK.test(e) && e.length < 80) found.add(e);
      }
    } catch (e) {
      log.warn("email extract fetch failed", { url, err: (e as Error).message });
    }
    if (found.size >= 3) break;
  }
  return [...found].slice(0, 3);
}

export async function discoverForCampaign(
  campaignId: string,
  opts: { limit?: number } = {},
): Promise<{ ok: boolean; discovered: number; reason?: string }> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { ok: false, discovered: 0, reason: "Campaign not found" };
  const settings = await getSettings();
  if (settings.emergencyPause) return { ok: false, discovered: 0, reason: "Emergency pause active" };

  const perDayCap = Math.min(opts.limit ?? 9999, campaign.maxNewLeadsPerDay ?? settings.dailyNewLeads);
  const queryBase = [campaign.businessType, campaign.positiveCriteria].filter(Boolean).join(" ");
  const cities = campaign.cities.length ? campaign.cities : [""];
  const country = campaign.countries[0] ?? "";

  let discovered = 0;
  try {
    for (const city of cities) {
      if (discovered >= perDayCap) break;
      let results;
      try {
        results = await runSearch({ query: queryBase || campaign.businessType || campaign.name, city, country, limit: 20 });
      } catch (e) {
        return { ok: false, discovered, reason: (e as Error).message };
      }

      for (const biz of results) {
        if (discovered >= perDayCap) break;
        // Reserve one LEAD unit atomically; stop cleanly when the daily cap is hit.
        let r;
        try {
          r = await reserve({ kind: "LEAD", campaignId, estimatedCost: 0, estimatedCount: 1, reference: campaignId, note: "discovery" });
        } catch (e) {
          if (e instanceof BudgetExceededError) return { ok: true, discovered, reason: e.message };
          throw e;
        }

        try {
          const emails = biz.website ? await extractPublicEmails(biz.website) : [];
          const records: LeadRecord[] = emails.length
            ? emails.map((email) => ({
                businessName: biz.name,
                website: biz.website,
                email,
                phone: biz.phone,
                city: biz.city || city,
                country: biz.country || country,
                category: biz.category,
                address: biz.address,
                sourceUrl: biz.sourceUrl,
                discoveryMethod: biz.source,
                matchExplanation: `Matched brief "${campaign.businessType}" via ${biz.source}.`,
              }))
            : [{
                businessName: biz.name,
                website: biz.website,
                phone: biz.phone,
                city: biz.city || city,
                country: biz.country || country,
                category: biz.category,
                address: biz.address,
                sourceUrl: biz.sourceUrl,
                discoveryMethod: biz.source,
                matchExplanation: `Matched brief "${campaign.businessType}" via ${biz.source}.`,
              }];

          const before = await prisma.lead.count();
          const summary = await importLeads(records, { sourceName: biz.source, sourceKind: "search_api", campaignId, requireEmail: true });
          const after = await prisma.lead.count();
          if (after > before) {
            discovered++;
            await r.commit(0, { count: 1 });
            // Queue research for the newly created lead(s).
            const lead = await prisma.lead.findFirst({ where: { primaryCampaignId: campaignId }, orderBy: { createdAt: "desc" } });
            if (lead) await enqueue("research", "research-lead", { leadId: lead.id });
          } else {
            // Not a new lead (duplicate/merge) — release the reserved unit.
            await r.release();
          }
        } catch (e) {
          await r.release();
          log.error("discover import failed", { err: (e as Error).message });
        }
      }
    }
    await audit("worker", "discover", "Campaign", campaignId, `Discovered ${discovered} new leads for ${campaign.name}`);
    return { ok: true, discovered };
  } catch (e) {
    log.error("discover failed", { campaignId, err: (e as Error).message });
    return { ok: false, discovered, reason: (e as Error).message };
  }
}
