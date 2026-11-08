import { NextRequest, NextResponse } from "next/server";
import { getOwner } from "@/lib/auth";
import { checkDomain, type DomainReport } from "@/lib/deliverability/dns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST { domains: [{ domain, selectors? }] | string[] } → live DNS auth reports.
export async function POST(req: NextRequest) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = (body as { domains?: unknown })?.domains;
  const list = Array.isArray(raw) ? raw : [];
  const targets = list
    .map((d) =>
      typeof d === "string"
        ? { domain: d, selectors: [] as string[] }
        : { domain: String((d as { domain?: string })?.domain ?? ""), selectors: ((d as { selectors?: string[] })?.selectors ?? []).filter(Boolean) },
    )
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d.domain.trim()))
    .slice(0, 25);

  if (targets.length === 0) {
    return NextResponse.json({ error: "No valid domains to check." }, { status: 400 });
  }

  const reports: DomainReport[] = await Promise.all(
    targets.map((t) => checkDomain(t.domain, t.selectors)),
  );

  return NextResponse.json({ reports });
}
