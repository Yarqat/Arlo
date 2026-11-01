import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";

const schema = z.object({
  action: z.enum(["upsert", "delete"]),
  id: z.string().optional(),
  name: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  enabled: z.boolean().optional(),
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "service";
}

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());
  if (b.action === "delete") {
    if (b.id) await prisma.service.delete({ where: { id: b.id } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }
  if (b.id) {
    await prisma.service.update({
      where: { id: b.id },
      data: {
        ...(b.name != null ? { name: b.name } : {}),
        ...(b.description != null ? { description: b.description } : {}),
        ...(b.enabled != null ? { enabled: b.enabled } : {}),
      },
    });
  } else {
    if (!b.name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const count = await prisma.service.count();
    let slug = slugify(b.name);
    if (await prisma.service.findUnique({ where: { slug } })) slug = `${slug}-${count + 1}`;
    await prisma.service.create({ data: { name: b.name, slug, description: b.description ?? "", sortOrder: count } });
  }
  return NextResponse.json({ ok: true });
});
