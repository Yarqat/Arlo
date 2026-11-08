// Inbox-health metrics derived entirely from existing Message + suppression
// data — no new tables. Powers the Deliverability dashboard.
import { prisma } from "@/lib/db";
import { promises as dns } from "node:dns";
import type { DmarcRow } from "./dmarc-parse";

export type Health = "healthy" | "watch" | "at_risk" | "idle";

export type MailboxHealth = {
  id: string;
  name: string;
  email: string;
  domain: string;
  sent: number;
  bounced: number;
  bounceRate: number; // 0–1
  deliveryRate: number; // 0–1, (sent - bounced) / sent
  health: Health;
};

export type Overview = {
  windowDays: number;
  sent: number;
  bounced: number;
  deliveredConfirmed: number;
  bounceRate: number;
  deliveryRate: number;
  unsubscribes: number;
  complaints: number;
  hardBounces: number;
  suppressedTotal: number;
  mailboxes: MailboxHealth[];
  domains: { domain: string; selectors: string[] }[];
};

const SENT_STATES = ["ACCEPTED", "SENT", "DELIVERED"] as const;

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function gradeHealth(sent: number, bounceRate: number): Health {
  if (sent < 20) return "idle";
  if (bounceRate > 0.05) return "at_risk";
  if (bounceRate > 0.02) return "watch";
  return "healthy";
}

export async function getOverview(windowDays = 30): Promise<Overview> {
  const cutoff = new Date(Date.now() - windowDays * 24 * 3600 * 1000);

  const [mailboxes, grouped, unsubscribes, complaints, hardBounces, suppressedTotal] =
    await Promise.all([
      prisma.mailbox.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, senderName: true, email: true, senderIdentities: true },
      }),
      prisma.message.groupBy({
        by: ["mailboxId", "state"],
        where: {
          direction: "OUTBOUND",
          OR: [{ sentAt: { gte: cutoff } }, { state: "BOUNCED", createdAt: { gte: cutoff } }],
        },
        _count: { _all: true },
      }),
      prisma.suppressionRecord.count({ where: { reason: "UNSUBSCRIBE" } }),
      prisma.suppressionRecord.count({ where: { reason: "COMPLAINT" } }),
      prisma.suppressionRecord.count({ where: { reason: "HARD_BOUNCE" } }),
      prisma.suppressionRecord.count(),
    ]);

  // Fold the grouped counts into per-mailbox sent/bounced tallies.
  const tally = new Map<string, { sent: number; bounced: number; delivered: number }>();
  for (const row of grouped) {
    const key = row.mailboxId ?? "_none";
    const t = tally.get(key) ?? { sent: 0, bounced: 0, delivered: 0 };
    const n = row._count._all;
    if ((SENT_STATES as readonly string[]).includes(row.state)) t.sent += n;
    if (row.state === "DELIVERED") t.delivered += n;
    if (row.state === "BOUNCED") t.bounced += n;
    tally.set(key, t);
  }

  const mbHealth: MailboxHealth[] = mailboxes.map((m) => {
    const t = tally.get(m.id) ?? { sent: 0, bounced: 0, delivered: 0 };
    const bounceRate = t.sent > 0 ? t.bounced / t.sent : 0;
    const deliveryRate = t.sent > 0 ? (t.sent - t.bounced) / t.sent : 0;
    return {
      id: m.id,
      name: m.senderName,
      email: m.email,
      domain: domainOf(m.email),
      sent: t.sent,
      bounced: t.bounced,
      bounceRate,
      deliveryRate,
      health: gradeHealth(t.sent, bounceRate),
    };
  });

  // Unique sending domains across mailbox addresses + rotation identities.
  const domainMap = new Map<string, Set<string>>();
  for (const m of mailboxes) {
    const emails = [m.email];
    const ids = Array.isArray(m.senderIdentities) ? (m.senderIdentities as { email?: string }[]) : [];
    for (const i of ids) if (i?.email) emails.push(i.email);
    for (const e of emails) {
      const d = domainOf(e);
      if (!d) continue;
      if (!domainMap.has(d)) domainMap.set(d, new Set());
      // selector hint from the local part is not reliable; keep empty for now.
    }
  }
  const domains = [...domainMap.entries()].map(([domain, sels]) => ({
    domain,
    selectors: [...sels],
  }));

  const sent = mbHealth.reduce((s, m) => s + m.sent, 0);
  const bounced = mbHealth.reduce((s, m) => s + m.bounced, 0);
  const deliveredConfirmed = [...tally.values()].reduce((s, t) => s + t.delivered, 0);

  return {
    windowDays,
    sent,
    bounced,
    deliveredConfirmed,
    bounceRate: sent > 0 ? bounced / sent : 0,
    deliveryRate: sent > 0 ? (sent - bounced) / sent : 0,
    unsubscribes,
    complaints,
    hardBounces,
    suppressedTotal,
    mailboxes: mbHealth,
    domains,
  };
}

// ---------------------------------------------------------------------------
// DMARC aggregate-report summary (Phase 2)
// ---------------------------------------------------------------------------

export type DmarcSource = {
  ip: string;
  host?: string;
  messages: number;
  aligned: number; // DMARC-passing message count
  rate: number; // aligned / messages
};

export type DmarcSummary = {
  windowDays: number;
  reportCount: number;
  orgs: string[];
  totalMessages: number;
  passMessages: number;
  alignmentRate: number;
  lastReportAt: string | null;
  sources: DmarcSource[];
  hasData: boolean;
};

async function reverseDns(ip: string): Promise<string | undefined> {
  try {
    const names = await Promise.race<string[]>([
      dns.reverse(ip),
      new Promise<string[]>((r) => setTimeout(() => r([]), 1500)),
    ]);
    return names[0];
  } catch {
    return undefined;
  }
}

export async function getDmarcSummary(windowDays = 30): Promise<DmarcSummary> {
  const cutoff = new Date(Date.now() - windowDays * 24 * 3600 * 1000);
  const reports = await prisma.dmarcReport.findMany({
    where: { dateEnd: { gte: cutoff } },
    orderBy: { dateEnd: "desc" },
    take: 500,
  });

  const orgs = new Set<string>();
  const bySource = new Map<string, { messages: number; aligned: number }>();
  let totalMessages = 0;
  let passMessages = 0;

  for (const rep of reports) {
    if (rep.orgName) orgs.add(rep.orgName);
    totalMessages += rep.totalCount;
    passMessages += rep.passCount;
    const rows = Array.isArray(rep.rows) ? (rep.rows as unknown as DmarcRow[]) : [];
    for (const row of rows) {
      if (!row?.sourceIp) continue;
      const s = bySource.get(row.sourceIp) ?? { messages: 0, aligned: 0 };
      s.messages += row.count;
      if (row.dkim === "pass" || row.spf === "pass") s.aligned += row.count;
      bySource.set(row.sourceIp, s);
    }
  }

  const ranked = [...bySource.entries()]
    .map(([ip, s]) => ({ ip, messages: s.messages, aligned: s.aligned, rate: s.messages ? s.aligned / s.messages : 0 }))
    .sort((a, b) => b.messages - a.messages)
    .slice(0, 10);

  // Best-effort reverse-DNS on the top sources so "who's sending as you" reads
  // as names where possible.
  const hosts = await Promise.all(ranked.map((r) => reverseDns(r.ip)));
  const sources: DmarcSource[] = ranked.map((r, i) => ({ ...r, host: hosts[i] }));

  return {
    windowDays,
    reportCount: reports.length,
    orgs: [...orgs],
    totalMessages,
    passMessages,
    alignmentRate: totalMessages ? passMessages / totalMessages : 0,
    lastReportAt: reports[0]?.dateEnd?.toISOString() ?? null,
    sources,
    hasData: reports.length > 0,
  };
}
