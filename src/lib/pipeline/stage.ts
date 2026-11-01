import { prisma } from "@/lib/db";
import { LeadStage } from "@prisma/client";
import { audit } from "@/lib/audit";

/** Change a lead's commercial stage with an audit trail. */
export async function changeStage(leadId: string, to: LeadStage, actor: string, note = "") {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { stage: true, businessName: true } });
  if (!lead || lead.stage === to) return;
  await prisma.$transaction([
    prisma.lead.update({ where: { id: leadId }, data: { stage: to } }),
    prisma.leadStageEvent.create({ data: { leadId, fromStage: lead.stage, toStage: to, actor, note } }),
  ]);
  await audit(actor, "stage_change", "Lead", leadId, `${lead.businessName}: ${lead.stage} → ${to}`);
}
