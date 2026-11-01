import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { isSuppressed } from "@/lib/suppression";
import { getSettings } from "@/lib/settings";
import { sendViaMailbox, buildMessageId } from "@/lib/providers/email";
import { audit } from "@/lib/audit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), threadId: z.string(), body: z.string().min(1).max(20000), subject: z.string().max(300).optional() }),
  z.object({ action: z.literal("archive"), threadId: z.string(), archived: z.boolean() }),
  z.object({ action: z.literal("resolve"), threadId: z.string() }),
  z.object({ action: z.literal("linkLead"), threadId: z.string(), leadId: z.string() }),
]);

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());
  const thread = await prisma.thread.findUnique({ where: { id: b.threadId }, include: { messages: { orderBy: { createdAt: "desc" } } } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  if (b.action === "archive") {
    await prisma.thread.update({ where: { id: b.threadId }, data: { archived: b.archived } });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "resolve") {
    await prisma.thread.update({ where: { id: b.threadId }, data: { needsAttention: false } });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "linkLead") {
    await prisma.thread.update({ where: { id: b.threadId }, data: { leadId: b.leadId, isLinkedToLead: true, labels: thread.labels.filter((l) => l !== "unmatched") } });
    return NextResponse.json({ ok: true });
  }

  // reply (owner-initiated)
  const settings = await getSettings();
  if (settings.emergencyPause) return NextResponse.json({ error: "Emergency pause is active" }, { status: 409 });

  const mailbox = thread.mailboxId
    ? await prisma.mailbox.findUnique({ where: { id: thread.mailboxId } })
    : await prisma.mailbox.findFirst({ where: { status: "CONNECTED", active: true } });
  if (!mailbox) return NextResponse.json({ error: "No mailbox available" }, { status: 400 });

  const lastInbound = thread.messages.find((m) => m.direction === "INBOUND");
  const recipient = lastInbound?.fromAddr || thread.participants.find((p) => p !== mailbox.email);
  if (!recipient) return NextResponse.json({ error: "No recipient to reply to" }, { status: 400 });
  if (await isSuppressed(recipient)) return NextResponse.json({ error: "Recipient is on the suppression list" }, { status: 400 });

  const subject = b.subject || (thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`);
  const messageIdHeader = buildMessageId(mailbox.email.split("@")[1] || "agent.yarqat.com");
  const ref = thread.messages.find((m) => m.messageIdHeader)?.messageIdHeader ?? undefined;

  const msg = await prisma.message.create({
    data: {
      threadId: thread.id, mailboxId: mailbox.id, leadId: thread.leadId, campaignId: thread.campaignId,
      direction: "OUTBOUND", state: "SENDING", toAddrs: [recipient], subject,
      bodyText: b.body, snippet: b.body.slice(0, 140), fromAddr: mailbox.email,
      messageIdHeader, inReplyTo: lastInbound?.messageIdHeader ?? ref, referencesHeader: ref,
    },
  });
  try {
    const res = await sendViaMailbox(mailbox, {
      from: `${mailbox.senderName} <${mailbox.email}>`, to: recipient, subject,
      text: b.body, messageId: messageIdHeader, inReplyTo: lastInbound?.messageIdHeader ?? undefined, references: ref,
    });
    await prisma.message.update({ where: { id: msg.id }, data: { state: res.accepted ? "ACCEPTED" : "SENT", sentAt: new Date(), providerMessageId: res.providerMessageId } });
    await prisma.thread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date(), needsAttention: false } });
    await audit("owner", "reply_sent", "Thread", thread.id, `Replied to ${recipient}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await prisma.message.update({ where: { id: msg.id }, data: { state: "FAILED" } });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
