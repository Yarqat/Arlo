import { NextResponse } from "next/server";
import { ownerRoute } from "@/lib/api";
import { learnBrandFromSite } from "@/lib/pipeline/brand";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// POST { url } → read the owner's own website and save it as brand context.
export const POST = ownerRoute(async (req) => {
  let url = "";
  try {
    url = String((await req.json())?.url || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!url) return NextResponse.json({ error: "Enter your website address first." }, { status: 400 });

  try {
    const brand = await learnBrandFromSite(url);
    await audit("owner", "brand_learn", "BusinessProfile", "singleton", `Learned brand from ${url} (${brand.services.length} services)`);
    return NextResponse.json({ ok: true, brand });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
});
