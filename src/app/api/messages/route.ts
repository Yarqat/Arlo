import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { enqueue } from "@/lib/queue";
import { audit } from "@/lib/audit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), id: z.string() }),
  z.object({ action: z.literal("discard"), id: z.string() }),
  z.object({ action: z.literal("edit"), id: z.string(), subject: z.string().max(300).optional(), bodyText: z.string().max(20000).optional() }),
]);

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());
  const msg = await prisma.message.findUnique({ where: { id: b.id } });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.action === "send") {
    if (!["DRAFT", "QUEUED"].includes(msg.state)) return NextResponse.json({ error: `Cannot send a ${msg.state} message` }, { status: 400 });
    await prisma.message.update({ where: { id: b.id }, data: { state: "QUEUED" } });
    await enqueue("outreach", "send", { action: "send", messageId: b.id, actor: "owner" });
    await audit("owner", "approve_send", "Message", b.id, "Owner approved send");
    return NextResponse.json({ ok: true });
  }
  if (b.action === "discard") {
    if (msg.state !== "DRAFT") return NextResponse.json({ error: "Only drafts can be discarded" }, { status: 400 });
    await prisma.message.delete({ where: { id: b.id } });
    return NextResponse.json({ ok: true });
  }
  // edit
  if (msg.state !== "DRAFT") return NextResponse.json({ error: "Only drafts can be edited" }, { status: 400 });
  await prisma.message.update({
    where: { id: b.id },
    data: { ...(b.subject != null ? { subject: b.subject } : {}), ...(b.bodyText != null ? { bodyText: b.bodyText, snippet: b.bodyText.slice(0, 140) } : {}) },
  });
  return NextResponse.json({ ok: true });
});
