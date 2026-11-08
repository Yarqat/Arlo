import { NextResponse } from "next/server";
import { getOwner } from "@/lib/auth";
import { ingestAll } from "@/lib/deliverability/dmarc-ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// POST → scan connected mailboxes for DMARC aggregate reports and store them.
export async function POST() {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await ingestAll();
  return NextResponse.json(result);
}
