import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/db";
import { imapOf } from "@/lib/providers/email";
import { suppress } from "@/lib/suppression";
import { normalizeEmail } from "@/lib/dedup";
import { enqueue } from "@/lib/queue";
import { audit } from "@/lib/audit";
import { log } from "@/lib/log";

function headerStr(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.join(" ");
  return String(v);
}

function isBounceFrom(from: string, contentType: string): boolean {
  return /mailer-daemon|postmaster|mail delivery|delivery status|delivery subsystem/i.test(from) || /report-type=delivery-status|multipart\/report/i.test(contentType);
}

/** Sync new messages from a mailbox INBOX. Idempotent via Message-ID + UID tracking. */
export async function syncMailbox(mailboxId: string): Promise<{ ok: boolean; newMessages: number; reason?: string }> {
  const mb = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!mb) return { ok: false, newMessages: 0, reason: "Mailbox not found" };
  const cfg = imapOf(mb);
  if (!cfg) return { ok: false, newMessages: 0, reason: "No IMAP config" };

  const client = new ImapFlow({
    host: cfg.host, port: cfg.port, secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass }, logger: false, socketTimeout: 30_000,
  });

  let newMessages = 0;
  try {
    await client.connect();
    const folderPath = "INBOX";
    const lock = await client.getMailboxLock(folderPath);
    try {
      const mailbox: any = client.mailbox;
      const uidValidity = BigInt(mailbox.uidValidity ?? 0);

      let folder = await prisma.mailboxFolder.findUnique({ where: { mailboxId_path: { mailboxId, path: folderPath } } });
      let lastSeen = folder?.lastSeenUid ?? 0n;
      // UIDVALIDITY change => the server reassigned UIDs; reset our cursor.
      if (folder && folder.uidValidity != null && folder.uidValidity !== uidValidity) {
        lastSeen = 0n;
        await audit("worker", "imap_uidvalidity", "Mailbox", mailboxId, "UIDVALIDITY changed; cursor reset");
      }

      const start = lastSeen + 1n;
      let maxUid = lastSeen;
      let processed = 0;

      for await (const m of client.fetch({ uid: `${start}:*` }, { uid: true, source: true, internalDate: true })) {
        if (!m.uid || BigInt(m.uid) <= lastSeen) continue; // guard against servers returning the boundary msg
        if (processed++ > 300) break;
        const uid = BigInt(m.uid);
        if (uid > maxUid) maxUid = uid;
        if (!m.source) continue;

        let parsed;
        try {
          parsed = await simpleParser(m.source as Buffer);
        } catch (e) {
          log.warn("parse failed", { uid: m.uid, err: (e as Error).message });
          continue;
        }

        const messageIdHeader = parsed.messageId ?? null;
        if (messageIdHeader) {
          const dup = await prisma.message.findUnique({ where: { messageIdHeader } });
          if (dup) continue; // already stored (dedupe)
        }

        const fromAddr = normalizeEmail(parsed.from?.value?.[0]?.address ?? "");
        const toList = (parsed.to as any)?.value?.map((a: any) => a.address).filter(Boolean) ?? [];
        const inReplyTo = parsed.inReplyTo ?? null;
        const references = headerStr(parsed.references) || null;
        const contentType = headerStr(parsed.headers.get("content-type"));
        const autoSubmitted = headerStr(parsed.headers.get("auto-submitted"));
        const bodyText = parsed.text ?? (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ") : "");

        // Bounce / DSN handling (structured, not just subject keywords).
        if (isBounceFrom(fromAddr, contentType)) {
          await handleBounce(mailboxId, parsed, bodyText);
          // Store the DSN as a message in an unmatched/bounce thread for the record.
          await storeMessage({ mailboxId, messageIdHeader, uid, folderPath, fromAddr, toList, subject: parsed.subject ?? "", bodyText, inReplyTo, references, isAutoReply: true, labels: ["bounce"], classification: "BOUNCE" });
          newMessages++;
          continue;
        }

        // Thread/lead matching
        const match = await matchThread({ mailboxId, inReplyTo, references, fromAddr, subject: parsed.subject ?? "" });
        const stored = await storeMessage({
          mailboxId, messageIdHeader, uid, folderPath, fromAddr, toList,
          subject: parsed.subject ?? "", bodyText, inReplyTo, references,
          isAutoReply: !!autoSubmitted && autoSubmitted.toLowerCase() !== "no",
          labels: match.leadId ? [] : ["unmatched"],
          threadId: match.threadId, leadId: match.leadId, contactId: match.contactId, campaignId: match.campaignId,
        });
        newMessages++;

        // Classify only genuine human replies that are matched to a lead.
        if (match.leadId && !(autoSubmitted && autoSubmitted.toLowerCase() !== "no")) {
          await enqueue("reply", "classify", { messageId: stored.id });
        } else if (match.leadId) {
          // auto-reply (e.g. OOO) still routed for OOO handling
          await enqueue("reply", "classify", { messageId: stored.id });
        }
      }

      await prisma.mailboxFolder.upsert({
        where: { mailboxId_path: { mailboxId, path: folderPath } },
        create: { mailboxId, path: folderPath, uidValidity, lastSeenUid: maxUid },
        update: { uidValidity, lastSeenUid: maxUid },
      });
    } finally {
      lock.release();
    }
    await client.logout();
    await prisma.mailbox.update({ where: { id: mailboxId }, data: { lastSyncAt: new Date(), lastError: "", status: "CONNECTED" } });
    return { ok: true, newMessages };
  } catch (e) {
    try { await client.close(); } catch {}
    await prisma.mailbox.update({ where: { id: mailboxId }, data: { lastError: (e as Error).message } });
    log.error("imap sync failed", { mailboxId, err: (e as Error).message });
    return { ok: false, newMessages, reason: (e as Error).message };
  }
}

/** Pure DSN classifier: permanent (5.x.x) vs temporary, and the failed recipient. */
export function classifyBounce(bodyText: string): { permanent: boolean; email?: string; statusCode?: string } {
  const email =
    bodyText.match(/Final-Recipient:\s*[^;]+;\s*([\w.+-]+@[\w.-]+)/i)?.[1] ??
    bodyText.match(/Original-Recipient:\s*[^;]+;\s*([\w.+-]+@[\w.-]+)/i)?.[1];
  const status = bodyText.match(/\bStatus:\s*(\d)\.(\d+)\.(\d+)/i);
  const permanent = status
    ? status[1] === "5"
    : /permanent|does not exist|no such user|user unknown|mailbox unavailable|\b550\b/i.test(bodyText) &&
      !/\b4\d\d\b|temporar|deferred|try again|greylist/i.test(bodyText);
  return { permanent, email, statusCode: status?.[0] };
}

async function handleBounce(mailboxId: string, parsed: any, bodyText: string) {
  const c = classifyBounce(bodyText);
  const final = c.email ?? parsed.to?.value?.[0]?.address;
  const permanent = c.permanent;
  const status = c.statusCode ? [c.statusCode] : null;
  if (!final) {
    await audit("worker", permanent ? "hard_bounce" : "temp_failure", "Mailbox", mailboxId, "Bounce without parseable recipient");
    return;
  }
  const email = normalizeEmail(final);
  if (permanent) {
    await suppress({ email, reason: "HARD_BOUNCE", source: "dsn", detail: status ? `status ${status[0]}` : "permanent failure" });
    await prisma.message.updateMany({
      where: { toAddrs: { has: email }, direction: "OUTBOUND", state: { in: ["ACCEPTED", "SENT", "DELIVERED"] } },
      data: { state: "BOUNCED" },
    });
    await audit("worker", "hard_bounce", "Suppression", email, `Hard bounce for ${email}`);
  } else {
    // Temporary failure: do NOT suppress. Record for visibility; bounded retry handled by schedule.
    await audit("worker", "temp_failure", "Message", email, `Temporary delivery failure for ${email}`);
  }
}

async function matchThread(args: { mailboxId: string; inReplyTo: string | null; references: string | null; fromAddr: string; subject: string }) {
  // 1) Match by In-Reply-To / References to one of our outbound Message-IDs.
  const refIds = [args.inReplyTo, ...(args.references?.split(/\s+/) ?? [])].filter(Boolean) as string[];
  for (const rid of refIds) {
    const prior = await prisma.message.findUnique({ where: { messageIdHeader: rid } });
    if (prior?.threadId) {
      return { threadId: prior.threadId, leadId: prior.leadId, contactId: prior.contactId, campaignId: prior.campaignId };
    }
  }
  // 2) Match by sender address to a known contact.
  const contact = await prisma.contact.findFirst({ where: { email: args.fromAddr }, include: { lead: true } });
  if (contact) {
    let thread = await prisma.thread.findFirst({ where: { mailboxId: args.mailboxId, leadId: contact.leadId } });
    if (!thread) {
      thread = await prisma.thread.create({
        data: { mailboxId: args.mailboxId, leadId: contact.leadId, subject: args.subject, participants: [args.fromAddr], isLinkedToLead: true },
      });
    }
    return { threadId: thread.id, leadId: contact.leadId, contactId: contact.id, campaignId: contact.lead.primaryCampaignId };
  }
  // 3) Unmatched — keep separate (do not link to any lead).
  const thread = await prisma.thread.create({
    data: { mailboxId: args.mailboxId, subject: args.subject, participants: [args.fromAddr], labels: ["unmatched"], isLinkedToLead: false },
  });
  return { threadId: thread.id, leadId: null, contactId: null, campaignId: null };
}

async function storeMessage(args: {
  mailboxId: string; messageIdHeader: string | null; uid: bigint; folderPath: string;
  fromAddr: string; toList: string[]; subject: string; bodyText: string;
  inReplyTo: string | null; references: string | null; isAutoReply: boolean;
  labels?: string[]; threadId?: string | null; leadId?: string | null; contactId?: string | null; campaignId?: string | null;
  classification?: string;
}) {
  let threadId = args.threadId ?? null;
  if (!threadId) {
    const t = await prisma.thread.create({
      data: { mailboxId: args.mailboxId, subject: args.subject, participants: [args.fromAddr], labels: args.labels ?? [], isLinkedToLead: false },
    });
    threadId = t.id;
  } else if (args.labels?.length) {
    const t = await prisma.thread.findUnique({ where: { id: threadId } });
    if (t) await prisma.thread.update({ where: { id: threadId }, data: { labels: Array.from(new Set([...t.labels, ...args.labels])) } });
  }

  const msg = await prisma.message.create({
    data: {
      threadId, mailboxId: args.mailboxId, leadId: args.leadId ?? null, contactId: args.contactId ?? null, campaignId: args.campaignId ?? null,
      direction: "INBOUND", state: "RECEIVED",
      fromAddr: args.fromAddr, toAddrs: args.toList, subject: args.subject,
      bodyText: args.bodyText.slice(0, 50000), snippet: args.bodyText.slice(0, 160),
      messageIdHeader: args.messageIdHeader, inReplyTo: args.inReplyTo, referencesHeader: args.references,
      imapUid: args.uid, imapFolder: args.folderPath, isAutoReply: args.isAutoReply, receivedAt: new Date(),
      classification: (args.classification as any) ?? "NONE",
    },
  });
  await prisma.thread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });
  return msg;
}
