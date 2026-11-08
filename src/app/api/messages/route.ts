import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { enqueue } from "@/lib/queue";
import { audit } from "@/lib/audit";
import { scrubOutreach } from "@/lib/pipeline/outreach";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), id: z.string() }),
  z.object({ action: z.literal("discard"), id: z.string() }),
  z.object({ action: z.literal("unqueue"), id: z.string() }), // pull a queued email back to draft
  z.object({ action: z.literal("edit"), id: z.string(), subject: z.string().max(300).optional(), bodyText: z.string().max(20000).optional() }),
]);

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());
  const msg = await prisma.message.findUnique({ where: { id: b.id } });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.action === "send") {
    if (!["DRAFT", "QUEUED"].includes(msg.state)) return NextResponse.json({ error: `Cannot send a ${msg.state} message` }, { status: 400 });
    // Check the content HERE, at approval, so the owner is told exactly what to
    // fix — rather than the worker silently bouncing it back to DRAFT at send
    // time (which made Approve look like it did nothing, and looped forever).
    const scrub = scrubOutreach(msg.subject + "\n" + msg.bodyText);
    if (!scrub.clean) {
      return NextResponse.json({
        error: `This email can't go out as written — it contains ${scrub.reasons.join("; and ")}. Edit it out above, then approve again.`,
        kind: "content",
      }, { status: 400 });
    }
    await prisma.message.update({ where: { id: b.id }, data: { state: "QUEUED" } });
    await enqueue("outreach", "send", { action: "send", messageId: b.id, actor: "owner" });
    await audit("owner", "approve_send", "Message", b.id, "Owner approved send");
    return NextResponse.json({ ok: true });
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
