import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { enqueue } from "@/lib/queue";
import { changeStage } from "@/lib/pipeline/stage";
import { classifyEmailType } from "@/lib/dedup";
import { audit } from "@/lib/audit";
import { EmailType } from "@prisma/client";

const schema = z.object({
  type: z.enum(["research", "verify", "draft", "stage", "add_contact", "delete_contact"]),
  stage: z.string().optional(),
  email: z.string().optional(),
  name: z.string().optional(),
  role: z.string().optional(),
  contactId: z.string().optional(),
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

  if (b.type === "add_contact") {
    const email = (b.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    const name = (b.name || "").trim();
    const emailType = classifyEmailType(email, !!name) as EmailType;
    const contact = await prisma.contact.upsert({
      where: { leadId_email: { leadId: lead.id, email } },
      create: { leadId: lead.id, email, name, role: (b.role || "").trim(), emailType, source: "manual" },
      update: { name: name || undefined, role: (b.role || "").trim() || undefined },
    });
    await audit("owner", "contact_add", "Lead", lead.id, `Added contact ${email} to ${lead.businessName}`);
    return NextResponse.json({ ok: true, contactId: contact.id });
  }

  if (b.type === "delete_contact") {
    if (!b.contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 });
    await prisma.contact.deleteMany({ where: { id: b.contactId, leadId: lead.id } });
    await audit("owner", "contact_delete", "Lead", lead.id, `Removed a contact from ${lead.businessName}`);
    return NextResponse.json({ ok: true });
  }

  const queueMap = { research: "research", verify: "verify", draft: "outreach" } as const;
  const jobName = { research: "research-lead", verify: "verify-lead", draft: "draft-lead" } as const;
  await enqueue(queueMap[b.type], jobName[b.type], { leadId: lead.id, manual: true });
  await audit("owner", `enqueue_${b.type}`, "Lead", lead.id, `Queued ${b.type} for ${lead.businessName}`);
  return NextResponse.json({ ok: true, queued: b.type });
});
