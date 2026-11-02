import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { reserve, BudgetExceededError } from "@/lib/budget";
import { runSearch } from "@/lib/providers/search";
import { safeFetch } from "@/lib/net/safe-fetch";
import { importLeads, LeadRecord } from "@/lib/leads";
import { enqueue } from "@/lib/queue";
import { audit } from "@/lib/audit";
import { log } from "@/lib/log";
import { normalizeEmail, canonicalDomain } from "@/lib/dedup";
import { dayKey, zonedWallToUtc } from "@/lib/time";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Third-party / platform / CMS / theme domains that appear in page markup but
// are never the business's own contact address.
const JUNK_DOMAIN = /(example\.com|sentry|wixpress|yourdomain|domain\.com|envato|themeforest|elementor|wordpress|wpengine|wix\.com|squarespace|shopify|godaddy|bluehost|hostgator|siteground|namecheap|cloudflare|google|gstatic|googleapis|facebook|fbcdn|instagram|twitter|linkedin|youtube|apple\.com|microsoft|amazonaws|sendgrid|mailchimp|hubspot|w3\.org|schema\.org|jquery|bootstrap|fontawesome|gravatar|cdn)/i;
// No-reply / system mailboxes — valid addresses, but never outreach targets.
const JUNK_LOCAL = /^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|mailer|postmaster|hostmaster|webmaster|abuse|root|notifications?|automated|bounce|unsubscribe)@/i;
const ASSET_EXT = /(\.png|\.jpe?g|\.gif|\.svg|\.webp|@2x|\.css|\.js)$/i;
const FREE_PROVIDER = /@(gmail|yahoo|hotmail|outlook|aol|icloud|proton(mail)?|gmx|live|msn|me)\./i;

/** Clean + validate one scraped address, or null if it's junk/third-party/system. */
function cleanScrapedEmail(raw: string): string | null {
  const e = normalizeEmail(raw);
  if (!/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return null;
  if (e.length >= 80) return null;
  if (ASSET_EXT.test(e) || JUNK_DOMAIN.test(e) || JUNK_LOCAL.test(e)) return null;
  return e;
}

/** Extract PUBLIC emails actually published on the homepage/contact page. Never guessed. */
async function extractPublicEmails(website: string): Promise<string[]> {
  const base = website.startsWith("http") ? website : `https://${website}`;
  const bizDomain = canonicalDomain(website);
  const onDomain = new Set<string>(); // the business's own domain — strongly preferred
  const fallback = new Set<string>(); // free-provider addresses, used only if no on-domain found
  const candidates = [base, base.replace(/\/$/, "") + "/contact", base.replace(/\/$/, "") + "/contact-us"];
  for (const url of candidates) {
    try {
      const res = await safeFetch(url, { maxBytes: 800_000, timeoutMs: 10000 });
      if (res.status >= 400) continue;
      for (const m of res.body.matchAll(EMAIL_RE)) {
        const e = cleanScrapedEmail(m[0]);
        if (!e) continue;
        const domain = e.split("@")[1];
        if (bizDomain && (domain === bizDomain || domain.endsWith("." + bizDomain))) onDomain.add(e);
        else if (FREE_PROVIDER.test(e)) fallback.add(e);
        // Any other off-domain corporate address (e.g. a vendor's) is ignored.
      }
    } catch (e) {
      log.warn("email extract fetch failed", { url, err: (e as Error).message });
    }
    if (onDomain.size >= 3) break;
  }
  const result = onDomain.size > 0 ? [...onDomain] : [...fallback];
  return result.slice(0, 3);
}

export async function discoverForCampaign(
  campaignId: string,
  opts: { limit?: number } = {},
): Promise<{ ok: boolean; discovered: number; reason?: string }> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { ok: false, discovered: 0, reason: "Campaign not found" };
  const settings = await getSettings();
  if (settings.emergencyPause) return { ok: false, discovered: 0, reason: "Emergency pause active" };

  // Honour a per-day target: count what this campaign already found today (in
  // its timezone) and only look for the remainder. Stops once the target is met,
  // which also avoids burning search credits re-finding the same businesses.
  const tz = campaign.timezone || settings.timezone;
  const [ty, tm, td] = dayKey(tz).split("-").map(Number);
  const todayStart = zonedWallToUtc(ty, tm, td, 0, 0, tz);
  const dailyTarget = campaign.maxNewLeadsPerDay ?? settings.dailyNewLeads;
  const foundToday = await prisma.lead.count({ where: { primaryCampaignId: campaignId, createdAt: { gte: todayStart } } });
  const remaining = dailyTarget - foundToday;
  if (remaining <= 0) return { ok: true, discovered: 0, reason: "Daily lead target reached" };
  const perDayCap = Math.min(opts.limit ?? remaining, remaining);

  const country = campaign.countries[0] ?? "";
  const cities = campaign.cities.length ? campaign.cities : [""];
  const queries = buildQueries(campaign);

  let discovered = 0;
  let searches = 0;
  const MAX_SEARCHES = 24; // cap search-provider calls per run
  const seen = new Set<string>(); // in-run de-dupe by website/name
  try {
    outer:
    for (const city of cities) {
      for (const q of queries) {
        // Paginate each query to pull fresh businesses beyond the first page.
        for (let page = 1; page <= 6; page++) {
          if (discovered >= perDayCap || searches >= MAX_SEARCHES) break outer;
          let results;
          try {
            results = await runSearch({ query: q, city, country, limit: 20, page });
          } catch (e) {
            if (searches === 0) return { ok: false, discovered, reason: (e as Error).message };
            break; // transient provider issue — move to the next query
          }
          searches++;
          if (results.length === 0) break; // no more pages for this query
          let added = 0;

          for (const biz of results) {
            if (discovered >= perDayCap) break outer;
            const key = (biz.website || biz.name || "").toLowerCase().trim();
            if (!key || seen.has(key)) continue;
            seen.add(key);

            let r;
            try {
              r = await reserve({ kind: "LEAD", campaignId, estimatedCost: 0, estimatedCount: 1, reference: campaignId, note: "discovery" });
            } catch (e) {
              if (e instanceof BudgetExceededError) return { ok: true, discovered, reason: e.message };
              throw e;
            }

            try {
              const emails = biz.website ? await extractPublicEmails(biz.website) : [];
              const common = {
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
              };
              const records: LeadRecord[] = emails.length ? emails.map((email) => ({ ...common, email })) : [{ ...common }];

              const before = await prisma.lead.count();
              await importLeads(records, { sourceName: biz.source, sourceKind: "search_api", campaignId, requireEmail: true });
              const after = await prisma.lead.count();
              if (after > before) {
                discovered++;
                added++;
                await r.commit(0, { count: 1 });
                const lead = await prisma.lead.findFirst({ where: { primaryCampaignId: campaignId }, orderBy: { createdAt: "desc" } });
                if (lead) await enqueue("research", "research-lead", { leadId: lead.id });
              } else {
                await r.release(); // duplicate / merged
              }
            } catch (e) {
              await r.release();
              log.error("discover import failed", { err: (e as Error).message });
            }
          }
          if (added === 0 && page > 1) break; // this query is exhausted of new results
        }
      }
    }
    await audit("worker", "discover", "Campaign", campaignId, `Discovered ${discovered} new leads for ${campaign.name} (${searches} searches)`);
    return { ok: true, discovered };
  } catch (e) {
    log.error("discover failed", { campaignId, err: (e as Error).message });
    return { ok: false, discovered, reason: (e as Error).message };
  }
}

/** Build a handful of query variations so discovery surfaces different businesses. */
function buildQueries(campaign: { businessType: string; name: string }): string[] {
  const base = (campaign.businessType || campaign.name || "").trim();
  if (!base) return [""];
  const out = new Set<string>([base]);
  for (const m of ["best", "top", "local", "affordable", "licensed", "emergency"]) out.add(`${m} ${base}`);
  for (const s of ["company", "services", "contractor"]) out.add(`${base} ${s}`);
  return [...out].slice(0, 9);
}
