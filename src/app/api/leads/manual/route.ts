import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerRoute } from "@/lib/api";
import { importLeads } from "@/lib/leads";

const schema = z.object({
  businessName: z.string().min(1).max(200),
  website: z.string().max(300).optional(),
  email: z.string().max(200).optional(),
  contactName: z.string().max(120).optional(),
  role: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(80).optional(),
  campaignId: z.string().optional(),
});

// Create a single lead by hand (reuses the same dedup + contact logic as CSV import).
export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim())) {
    return NextResponse.json({ error: "Enter a valid email, or leave it blank." }, { status: 400 });
  }
  const summary = await importLeads(
    [{
      businessName: b.businessName.trim(),
      website: b.website?.trim(),
      email: b.email?.trim().toLowerCase(),
      contactName: b.contactName?.trim(),
      role: b.role?.trim(),
      city: b.city?.trim(),
      country: b.country?.trim(),
      discoveryMethod: "manual",
      sourceUrl: b.website?.trim(),
    }],
    { sourceName: "Manual entry", sourceKind: "manual", campaignId: b.campaignId || null, requireEmail: false },
  );
  return NextResponse.json({ ok: true, summary });
});
