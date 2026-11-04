import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { enqueue } from "@/lib/queue";
import { changeStage } from "@/lib/pipeline/stage";
import { audit } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import { buildLeadWhere } from "@/lib/lead-filter";

const CAP = 5000;

const schema = z.object({
  action: z.enum(["verify", "research", "draft", "stage"]),
  // target either an explicit set of ids, or everything matching a filter
  leadIds: z.array(z.string()).max(CAP).optional(),
  stage: z.string().optional(),
  q: z.string().optional(),
  campaign: z.string().optional(),
  qualification: z.string().optional(),
  hasContact: z.enum(["yes", "no"]).optional(),
  newStage: z.string().optional(), // for action === "stage"
});

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());

  const where: Prisma.LeadWhereInput = b.leadIds?.length
    ? { id: { in: b.leadIds } }
    : buildLeadWhere({ stage: b.stage, q: b.q, campaign: b.campaign, qualification: b.qualification, hasContact: b.hasContact });
  const leads = await prisma.lead.findMany({ where, select: { id: true }, take: CAP });
  if (leads.length === 0) return NextResponse.json({ ok: true, queued: 0 });

  if (b.action === "stage") {
    if (!b.newStage) return NextResponse.json({ error: "newStage required" }, { status: 400 });
    for (const l of leads) await changeStage(l.id, b.newStage as any, "owner", "Bulk change");
    await audit("owner", "bulk_stage", "Lead", "bulk", `Moved ${leads.length} leads → ${b.newStage}`);
    return NextResponse.json({ ok: true, queued: leads.length });
  }

  const queueMap = { research: "research", verify: "verify", draft: "outreach" } as const;
  const jobName = { research: "research-lead", verify: "verify-lead", draft: "draft-lead" } as const;
  // Enqueue one job per lead; the worker paces them and every job still passes
  // through its own budget reservation, so a bulk run can never overspend.
  for (const l of leads) await enqueue(queueMap[b.action], jobName[b.action], { leadId: l.id, manual: true });
  await audit("owner", `bulk_${b.action}`, "Lead", "bulk", `Queued ${b.action} for ${leads.length} leads`);
  return NextResponse.json({ ok: true, queued: leads.length });
});
