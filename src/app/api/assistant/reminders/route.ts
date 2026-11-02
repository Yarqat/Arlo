import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { parseLocalDateTime } from "@/lib/time";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = ownerRoute(async () => {
  const [reminders, notifications] = await Promise.all([
    prisma.reminder.findMany({ where: { status: { in: ["SCHEDULED", "FIRED"] } }, orderBy: { dueAt: "asc" }, take: 50 }),
    prisma.assistantNotification.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return NextResponse.json({ reminders, notifications });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), title: z.string().min(1).max(200), details: z.string().max(1000).optional(), whenLocal: z.string().min(10) }),
  z.object({ action: z.literal("cancel"), id: z.string() }),
  z.object({ action: z.literal("done"), id: z.string() }),
  z.object({ action: z.literal("read"), id: z.string() }),
  z.object({ action: z.literal("read_all") }),
]);

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());
  const settings = await getSettings();
  if (b.action === "add") {
    const due = parseLocalDateTime(b.whenLocal, settings.timezone);
    if (!due) return NextResponse.json({ error: "Could not read that date/time. Use YYYY-MM-DD HH:mm." }, { status: 400 });
    const r = await prisma.reminder.create({ data: { title: b.title, details: b.details || "", dueAt: due, timezone: settings.timezone, source: "manual" } });
    await audit("owner", "reminder_add", "Reminder", r.id, `Reminder "${b.title}"`);
    return NextResponse.json({ ok: true, id: r.id, dueAt: due.toISOString() });
  }
  if (b.action === "cancel") {
    await prisma.reminder.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "done") {
    await prisma.reminder.update({ where: { id: b.id }, data: { status: "DONE" } });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "read") {
    await prisma.assistantNotification.update({ where: { id: b.id }, data: { read: true } });
    return NextResponse.json({ ok: true });
  }
  await prisma.assistantNotification.updateMany({ where: { read: false }, data: { read: true } });
  return NextResponse.json({ ok: true });
});
