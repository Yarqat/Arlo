import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { enqueue } from "@/lib/queue";
import { audit } from "@/lib/audit";
import { scrubLeak, scrubDeliverability, rewriteOutreach } from "@/lib/pipeline/outreach";

const schema = z.discriminatedUnion("action", [
  // override = owner chose "Send anyway" past a spam-word warning.
  z.object({ action: z.literal("send"), id: z.string(), override: z.boolean().optional() }),
  z.object({ action: z.literal("discard"), id: z.string() }),
  z.object({ action: z.literal("unqueue"), id: z.string() }), // pull a queued email back to draft
  z.object({ action: z.literal("rewrite"), id: z.string() }), // AI-clean a flagged draft
  z.object({ action: z.literal("edit"), id: z.string(), subject: z.string().max(300).optional(), bodyText: z.string().max(20000).optional() }),
]);

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());
  const msg = await prisma.message.findUnique({ where: { id: b.id } });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.action === "send") {
    if (!["DRAFT", "QUEUED"].includes(msg.state)) return NextResponse.json({ error: `Cannot send a ${msg.state} message` }, { status: 400 });
    const text = msg.subject + "\n" + msg.bodyText;
    // Tier 1 — leaked AI/meta text is broken output and can NEVER be overridden.
    const leak = scrubLeak(text);
    if (!leak.clean) {
      return NextResponse.json({
        error: `This email contains text that was never meant to send — ${leak.reasons.join("; and ")}. Use Rewrite to fix it.`,
        kind: "leak",
      }, { status: 400 });
    }
    // Tier 2 — spam words hurt deliverability but are the owner's call. Warn, and
    // let "Send anyway" (override) through; remember it so later retries honour it.
    const spam = scrubDeliverability(text);
    if (!spam.clean && !b.override) {
      return NextResponse.json({
        error: `This email contains ${spam.reasons.join("; and ")}. Rewrite it to protect deliverability, or send it anyway.`,
        kind: "spamword",
        canOverride: true,
      }, { status: 400 });
    }
    await prisma.message.update({ where: { id: b.id }, data: { state: "QUEUED", ...(!spam.clean ? { allowSpamWords: true } : {}) } });
    await enqueue("outreach", "send", { action: "send", messageId: b.id, actor: "owner" });
    await audit("owner", "approve_send", "Message", b.id, spam.clean ? "Owner approved send" : `Owner approved send despite warning: ${spam.reasons.join(", ")}`);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "rewrite") {
    if (!["DRAFT", "QUEUED"].includes(msg.state)) return NextResponse.json({ error: `Can't rewrite a ${msg.state} message` }, { status: 400 });
    const reasons = [...scrubLeak(msg.subject + "\n" + msg.bodyText).reasons, ...scrubDeliverability(msg.subject + "\n" + msg.bodyText).reasons];
    try {
      const out = await rewriteOutreach(msg.subject, msg.bodyText, reasons.length ? reasons : ["spam-trigger wording"], msg.campaignId);
      await prisma.message.update({ where: { id: b.id }, data: { subject: out.subject, bodyText: out.bodyText, snippet: out.bodyText.slice(0, 140) } });
      await audit("owner", "message_rewrite", "Message", b.id, "Owner rewrote a flagged draft");
      return NextResponse.json({ ok: true, subject: out.subject, bodyText: out.bodyText });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || "Rewrite failed. Edit the draft by hand.", kind: "rewrite" }, { status: 502 });
    }
  }
  if (b.action === "discard") {
    if (!["DRAFT", "QUEUED"].includes(msg.state)) return NextResponse.json({ error: "Only unsent emails can be discarded" }, { status: 400 });
    await prisma.message.delete({ where: { id: b.id } });
    await audit("owner", "message_discard", "Message", b.id, "Owner discarded an unsent email");
    return NextResponse.json({ ok: true });
  }
  if (b.action === "unqueue") {
    if (msg.state !== "QUEUED") return NextResponse.json({ error: "Only a queued email can be pulled back" }, { status: 400 });
    await prisma.message.update({ where: { id: b.id }, data: { state: "DRAFT" } });
    await audit("owner", "message_unqueue", "Message", b.id, "Owner pulled a queued email back to draft");
    return NextResponse.json({ ok: true });
  }
  // edit — allowed while the email hasn't actually been sent (draft or queued)
  if (!["DRAFT", "QUEUED"].includes(msg.state)) return NextResponse.json({ error: "A sent email can't be edited" }, { status: 400 });
  await prisma.message.update({
    where: { id: b.id },
    data: { ...(b.subject != null ? { subject: b.subject } : {}), ...(b.bodyText != null ? { bodyText: b.bodyText, snippet: b.bodyText.slice(0, 140) } : {}) },
  });
  await audit("owner", "message_edit", "Message", b.id, "Owner edited an unsent email");
  return NextResponse.json({ ok: true });
});
