import { NextRequest, NextResponse } from "next/server";
import { requireOwner, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    await requireOwner();
    const { paused } = await req.json();
    await prisma.globalSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", emergencyPause: !!paused },
      update: { emergencyPause: !!paused },
    });
    await audit("owner", paused ? "pause_all" : "resume_all", "GlobalSettings", "singleton",
      paused ? "Emergency pause enabled" : "Outbound resumed");
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
