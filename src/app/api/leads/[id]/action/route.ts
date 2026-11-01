import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { enqueue } from "@/lib/queue";
import { changeStage } from "@/lib/pipeline/stage";
import { audit } from "@/lib/audit";

const schema = z.object({
  type: z.enum(["research", "verify", "draft", "stage"]),
  stage: z.string().optional(),
});

export const POST = ownerRoute(async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/").slice(-2, -1)[0];
  const b = schema.parse(await req.json());
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.type === "stage") {
    if (!b.stage) return NextResponse.json({ error: "stage required" }, { status: 400 });
    await changeStage(lead.id, b.stage as any, "owner", "Manual change");
    return NextResponse.json({ ok: true });
  }

  const queueMap = { research: "research", verify: "verify", draft: "outreach" } as const;
  const jobName = { research: "research-lead", verify: "verify-lead", draft: "draft-lead" } as const;
  await enqueue(queueMap[b.type], jobName[b.type], { leadId: lead.id, manual: true });
  await audit("owner", `enqueue_${b.type}`, "Lead", lead.id, `Queued ${b.type} for ${lead.businessName}`);
  return NextResponse.json({ ok: true, queued: b.type });
});
