// Pull DMARC aggregate reports from a mailbox's INBOX over IMAP, decompress and
// parse them, and upsert them. Idempotent via a per-report unique key.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/db";
import { imapOf } from "@/lib/providers/email";
import { decompress, parseDmarcXml } from "./dmarc-parse";
import { log } from "@/lib/log";

export type IngestResult = { ok: boolean; reports: number; scanned: number; reason?: string };

export async function ingestForMailbox(mailboxId: string, max = 150): Promise<IngestResult> {
  const mb = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!mb) return { ok: false, reports: 0, scanned: 0, reason: "Mailbox not found" };
  const cfg = imapOf(mb);
  if (!cfg) return { ok: false, reports: 0, scanned: 0, reason: "No IMAP config" };

  const client = new ImapFlow({
    host: cfg.host, port: cfg.port, secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass }, logger: false, socketTimeout: 30_000,
  });

  let reports = 0;
  let scanned = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // DMARC report emails use the RFC 7489 subject "Report Domain: …".
      const found = new Set<number>();
      for (const subject of ["Report Domain", "Report domain"]) {
        try {
          const hits = (await client.search({ subject }, { uid: true })) || [];
          for (const u of hits) found.add(u as number);
        } catch { /* server may reject the search; ignore */ }
      }
      const uids = [...found].sort((a, b) => b - a).slice(0, max);
      if (uids.length) {
        for await (const m of client.fetch(uids, { source: true }, { uid: true })) {
          if (!m.source) continue;
          scanned++;
          let parsed;
          try { parsed = await simpleParser(m.source as Buffer); } catch { continue; }
          for (const att of parsed.attachments || []) {
            const xml = decompress(att.filename || "", att.contentType || "", att.content as Buffer);
            if (!xml) continue;
            const rep = parseDmarcXml(xml.toString("utf8"));
            if (!rep || !rep.reportId) continue;
            const key = `${rep.orgName}:${rep.reportId}`;
            const total = rep.rows.reduce((s, r) => s + r.count, 0);
            const pass = rep.rows.reduce((s, r) => s + (r.dkim === "pass" || r.spf === "pass" ? r.count : 0), 0);
            try {
              // Create-and-catch keeps ingestion idempotent and tenant-safe in both
              // the single-tenant app (key is globally unique) and the SaaS (key is
              // unique per account). A duplicate throws P2002 and is skipped.
              await prisma.dmarcReport.create({
                data: {
                  key, reportId: rep.reportId, orgName: rep.orgName, domain: rep.domain,
                  dateBegin: new Date(rep.begin * 1000), dateEnd: new Date(rep.end * 1000),
                  policyP: rep.policyP, totalCount: total, passCount: pass,
                  rows: rep.rows as unknown as object, mailboxId,
                },
              });
              reports++;
            } catch (e) {
              if ((e as { code?: string })?.code !== "P2002") {
                log.warn("dmarc store failed", { err: (e as Error).message });
              }
            }
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return { ok: true, reports, scanned };
  } catch (e) {
    try { await client.close(); } catch { /* ignore */ }
    return { ok: false, reports, scanned, reason: (e as Error).message };
  }
}

export async function ingestAll(): Promise<IngestResult & { mailboxes: number }> {
  const mbs = await prisma.mailbox.findMany({
    where: { status: "CONNECTED", imapConfigEnc: { not: null } },
    select: { id: true },
  });
  let reports = 0;
  let scanned = 0;
  for (const mb of mbs) {
    const r = await ingestForMailbox(mb.id);
    reports += r.reports;
    scanned += r.scanned;
  }
  return { ok: true, reports, scanned, mailboxes: mbs.length };
}
