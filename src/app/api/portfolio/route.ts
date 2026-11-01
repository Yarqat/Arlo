import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";

const schema = z.object({
  action: z.enum(["create", "delete"]),
  id: z.string().optional(),
  title: z.string().max(200).optional(),
  url: z.string().max(300).optional(),
  description: z.string().max(1000).optional(),
});

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());
  if (b.action === "delete") {
    if (b.id) await prisma.portfolioItem.delete({ where: { id: b.id } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }
  if (!b.title) return NextResponse.json({ error: "Title required" }, { status: 400 });
  await prisma.portfolioItem.create({ data: { title: b.title, url: b.url ?? "", description: b.description ?? "" } });
  return NextResponse.json({ ok: true });
});
