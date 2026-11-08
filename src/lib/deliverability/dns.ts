// Domain email-authentication checker. Pure DNS lookups — no third-party API.
// Validates SPF, DKIM, DMARC and MX for a sending domain and returns a report
// with plain-language fixes. Tuned for Amazon SES (the primary send path) but
// the guidance is generic enough for any provider.
import { promises as dns } from "node:dns";

export type CheckStatus = "pass" | "warn" | "fail" | "unknown";

export type Check = {
  id: "spf" | "dkim" | "dmarc" | "mx";
  label: string;
  status: CheckStatus;
  summary: string; // one-line verdict
  value?: string; // the record we found, if any
  fix?: string; // what to do when not passing
};

export type DomainReport = {
  domain: string;
  status: CheckStatus; // worst of the auth checks
  score: number; // 0–100
  checks: Check[];
  checkedAt: string;
};

// SES Easy DKIM uses unguessable token selectors (CNAMEs), so we probe the
// common provider selectors in parallel and report whichever resolves.
const DEFAULT_SELECTORS = [
  "amazonses", "default", "google", "selector1", "selector2", "s1", "s2",
  "k1", "k2", "mail", "dkim", "smtp", "pm", "mandrill", "mxvault", "zmail",
];

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

async function safeTxt(name: string): Promise<string[]> {
  try {
    const recs = await withTimeout(dns.resolveTxt(name), 5000, [] as string[][]);
    return recs.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}
async function safeMx(name: string): Promise<{ exchange: string; priority: number }[]> {
  try {
    return await withTimeout(dns.resolveMx(name), 5000, []);
  } catch {
    return [];
  }
}
async function safeCname(name: string): Promise<string[]> {
  try {
    return await withTimeout(dns.resolveCname(name), 5000, [] as string[]);
  } catch {
    return [];
  }
}

// Count the DNS-lookup mechanisms in an SPF record (the RFC limit is 10).
function spfLookupCount(record: string): number {
  const terms = record.toLowerCase().split(/\s+/);
  return terms.filter((t) =>
    /^(\+|-|~|\?)?(include:|a$|a:|mx$|mx:|ptr|exists:|redirect=)/.test(t),
  ).length;
}

function mxCheck(mx: { exchange: string; priority: number }[]): Check {
  if (mx.length === 0) {
    return {
      id: "mx",
      label: "MX records",
      status: "warn",
      summary: "No mail servers found — this domain can't receive replies or bounce notices.",
      fix: "Add MX records if replies should land on this domain. If you reply from a different domain, you can ignore this.",
    };
  }
  const top = [...mx].sort((a, b) => a.priority - b.priority)[0];
  return {
    id: "mx",
    label: "MX records",
    status: "pass",
    summary: `${mx.length} mail server${mx.length > 1 ? "s" : ""} configured.`,
    value: `${top.exchange} (priority ${top.priority})`,
  };
}

function spfCheck(domain: string, txt: string[]): Check {
  const records = txt.filter((r) => /^v=spf1/i.test(r.trim()));
  if (records.length === 0) {
    return {
      id: "spf",
      label: "SPF",
      status: "fail",
      summary: "No SPF record — receivers can't confirm who may send for you.",
      fix: `Add a TXT record at "${domain}":  v=spf1 include:amazonses.com -all`,
    };
  }
  if (records.length > 1) {
    return {
      id: "spf",
      label: "SPF",
      status: "fail",
      summary: "More than one SPF record — this is invalid and SPF will fail entirely.",
      value: records.join("  |  "),
      fix: "Merge your SPF records into exactly one TXT record starting with v=spf1.",
    };
  }
  const rec = records[0];
  const lookups = spfLookupCount(rec);
  const hasSes = /include:amazonses\.com|include:[^\s]*amazonses/i.test(rec);
  const allQualifier = (rec.match(/([-~?+])all\b/i) || [])[1];

  if (lookups > 10) {
    return {
      id: "spf", label: "SPF", status: "warn", value: rec,
      summary: `SPF uses ${lookups} DNS lookups — over the limit of 10, so it may fail.`,
      fix: "Flatten or remove unused include: mechanisms to get back under 10 lookups.",
    };
  }
  if (!hasSes) {
    return {
      id: "spf", label: "SPF", status: "warn", value: rec,
      summary: "SPF exists but doesn't authorise Amazon SES.",
      fix: "Add  include:amazonses.com  to your SPF record (before the -all).",
    };
  }
  if (allQualifier === "+" || allQualifier === "?") {
    return {
      id: "spf", label: "SPF", status: "warn", value: rec,
      summary: `SPF ends in "${allQualifier}all" — it doesn't reject unlisted senders.`,
      fix: "Change the ending to -all (strict) once every legitimate sender is listed.",
    };
  }
  return {
    id: "spf", label: "SPF", status: "pass", value: rec,
    summary: "SPF authorises Amazon SES and rejects everyone else.",
  };
}

function dmarcCheck(domain: string, txt: string[]): Check {
  const records = txt.filter((r) => /^v=DMARC1/i.test(r.trim()));
  if (records.length === 0) {
    return {
      id: "dmarc", label: "DMARC", status: "fail",
      summary: "No DMARC policy — nothing tells receivers what to do with spoofed mail.",
      fix: `Add a TXT record at "_dmarc.${domain}":  v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
    };
  }
  if (records.length > 1) {
    return {
      id: "dmarc", label: "DMARC", status: "fail", value: records.join("  |  "),
      summary: "More than one DMARC record — this is invalid and DMARC is ignored.",
      fix: "Delete the duplicate DMARC records so exactly one remains at _dmarc." + domain,
    };
  }
  const rec = records[0];
  const policy = (rec.match(/\bp=\s*(none|quarantine|reject)/i) || [])[1]?.toLowerCase();
  const hasRua = /rua=/i.test(rec);
  if (policy === "none") {
    return {
      id: "dmarc", label: "DMARC", status: "warn", value: rec,
      summary: "DMARC is monitor-only (p=none) — spoofed mail still gets delivered.",
      fix: hasRua
        ? "Once SPF and DKIM pass, tighten the policy to p=quarantine, then p=reject."
        : "Add a rua=mailto: address to collect reports, then move to p=quarantine and p=reject.",
    };
  }
  if (policy === "quarantine") {
    return {
      id: "dmarc", label: "DMARC", status: "pass", value: rec,
      summary: "DMARC quarantines spoofed mail. Move to p=reject for full protection.",
    };
  }
  if (policy === "reject") {
    return {
      id: "dmarc", label: "DMARC", status: "pass", value: rec,
      summary: "DMARC rejects spoofed mail — the strongest setting.",
    };
  }
  return {
    id: "dmarc", label: "DMARC", status: "warn", value: rec,
    summary: "DMARC record found but its policy couldn't be read.",
    fix: "Make sure the record includes a valid p=none|quarantine|reject tag.",
  };
}

async function dkimCheck(domain: string, selectors: string[]): Promise<Check> {
  const sels = [...new Set([...selectors.filter(Boolean), ...DEFAULT_SELECTORS])].slice(0, 18);
  const results = await Promise.all(
    sels.map(async (s) => {
      const host = `${s}._domainkey.${domain}`;
      const txt = await safeTxt(host);
      const hit = txt.find((r) => /(^|;)\s*(v=DKIM1|k=rsa|p=[A-Za-z0-9+/])/i.test(r));
      if (hit) return { selector: s, record: hit, via: "TXT" as const };
      const cname = await safeCname(host);
      if (cname.length) return { selector: s, record: cname[0], via: "CNAME" as const };
      return null;
    }),
  );
  const found = results.find((r): r is NonNullable<typeof r> => !!r);
  if (found) {
    return {
      id: "dkim", label: "DKIM", status: "pass",
      summary: `DKIM is signing mail (selector "${found.selector}").`,
      value: found.via === "CNAME" ? `${found.selector}._domainkey → ${found.record}` : found.record.slice(0, 80) + "…",
    };
  }
  return {
    id: "dkim", label: "DKIM", status: "warn",
    summary: "Couldn't detect a DKIM signature on the usual selectors.",
    fix: "Enable Easy DKIM in Amazon SES and add the three CNAME records it gives you. If you already use a custom selector, it may just not be in our probe list.",
  };
}

const WEIGHTS: Record<Check["id"], number> = { spf: 25, dkim: 25, dmarc: 30, mx: 20 };
const SCORE: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0, unknown: 0 };

export async function checkDomain(domainRaw: string, selectors: string[] = []): Promise<DomainReport> {
  const domain = domainRaw.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
  const [txt, dmarcTxt, mx, dkim] = await Promise.all([
    safeTxt(domain),
    safeTxt(`_dmarc.${domain}`),
    safeMx(domain),
    dkimCheck(domain, selectors),
  ]);
  const checks: Check[] = [spfCheck(domain, txt), dkim, dmarcCheck(domain, dmarcTxt), mxCheck(mx)];

  const score = Math.round(
    checks.reduce((sum, c) => sum + WEIGHTS[c.id] * SCORE[c.status], 0),
  );
  // Overall status is driven by the three auth checks (MX is advisory).
  const auth = checks.filter((c) => c.id !== "mx");
  const status: CheckStatus = auth.some((c) => c.status === "fail")
    ? "fail"
    : auth.some((c) => c.status === "warn") || checks.some((c) => c.status === "warn")
      ? "warn"
      : "pass";

  return { domain, status, score, checks, checkedAt: new Date().toISOString() };
}
