import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

// Simple in-memory throttle per IP (single-process; defence in depth behind Cloudflare).
const attempts = new Map<string, { n: number; t: number }>();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const rec = attempts.get(ip);
  const now = Date.now();
  if (rec && now - rec.t < 15 * 60_000 && rec.n >= 10) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const owner = await prisma.owner.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const ok = owner && verifyPassword(parsed.data.password, owner.passwordHash);

  if (!ok || !owner) {
    attempts.set(ip, { n: (rec?.n ?? 0) + 1, t: rec?.t ?? now });
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  attempts.delete(ip);
  await createSession(owner.id);
  await prisma.owner.update({ where: { id: owner.id }, data: { lastLoginAt: new Date() } });
  await audit("owner", "login", "Owner", owner.id, "Signed in");
  return NextResponse.json({ ok: true });
}
