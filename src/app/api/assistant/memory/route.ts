import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { remember, assertNotCredential, CredentialInMemoryError } from "@/lib/assistant/memory";
import { audit } from "@/lib/audit";
import { MemoryScope } from "@prisma/client";

export const dynamic = "force-dynamic";

export const GET = ownerRoute(async () => {
  const memory = await prisma.assistantMemory.findMany({ orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }] });
  return NextResponse.json({ memory });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), scope: z.enum(["PERSONAL", "BUSINESS"]), title: z.string().min(1).max(120), content: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("update"), id: z.string(), title: z.string().min(1).max(120), content: z.string().min(1).max(2000), pinned: z.boolean().optional() }),
  z.object({ action: z.literal("delete"), id: z.string() }),
]);

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());
  try {
    if (b.action === "add") {
      const m = await remember(b.scope as MemoryScope, b.title, b.content);
      await audit("owner", "memory_add", "AssistantMemory", m.id, `Added ${b.scope} memory: ${b.title}`);
      return NextResponse.json({ ok: true, id: m.id });
    }
    if (b.action === "update") {
      assertNotCredential(`${b.title} ${b.content}`);
      await prisma.assistantMemory.update({ where: { id: b.id }, data: { title: b.title, content: b.content, ...(b.pinned != null ? { pinned: b.pinned } : {}) } });
      await audit("owner", "memory_update", "AssistantMemory", b.id, `Edited memory: ${b.title}`);
      return NextResponse.json({ ok: true });
    }
    await prisma.assistantMemory.delete({ where: { id: b.id } });
    await audit("owner", "memory_delete", "AssistantMemory", b.id, "Deleted memory");
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CredentialInMemoryError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
});
