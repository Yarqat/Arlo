import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerRoute } from "@/lib/api";
import { parseCsv, autoMap } from "@/lib/csv";
import { importLeads, LeadRecord } from "@/lib/leads";

const schema = z.object({
  csv: z.string().min(1).max(12_000_000),
  requireEmail: z.boolean().default(true),
  campaignId: z.string().optional(),
  mapping: z.record(z.string(), z.number()).optional(),
});

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());
  const rows = parseCsv(b.csv);
  if (rows.length < 2) return NextResponse.json({ error: "CSV has no data rows." }, { status: 400 });
  const headers = rows[0];
  const map = b.mapping && Object.keys(b.mapping).length ? b.mapping : autoMap(headers);
  if (map.businessName == null) {
    return NextResponse.json({ error: "Could not find a business/company name column.", headers }, { status: 400 });
  }
  const get = (row: string[], field: string) => (map[field] != null ? (row[map[field]] ?? "").trim() : "");
  const records: LeadRecord[] = rows.slice(1, 5001).map((row) => ({
    businessName: get(row, "businessName"),
    website: get(row, "website"),
    email: get(row, "email"),
    contactName: get(row, "contactName"),
    role: get(row, "role"),
    phone: get(row, "phone"),
    city: get(row, "city"),
    region: get(row, "region"),
    country: get(row, "country"),
    category: get(row, "category"),
    address: get(row, "address"),
    discoveryMethod: "csv_import",
    sourceUrl: get(row, "website"),
  }));

  const summary = await importLeads(records, {
    sourceName: "CSV import",
    sourceKind: "csv",
    campaignId: b.campaignId,
    requireEmail: b.requireEmail,
  });
  return NextResponse.json({ ok: true, summary, totalRows: records.length });
});
