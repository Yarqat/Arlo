import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Click-tracking redirect. A link in an outbound email points here; we log the
 * click against the message, then forward the recipient to the real destination.
 * Public (recipients aren't logged in) and defensive: only http/https targets,
 * and a bad/missing target still fails safe without throwing.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const raw = req.nextUrl.searchParams.get("u") ?? "";

  let dest: URL | null = null;
  try {
    dest = new URL(raw);
    if (dest.protocol !== "http:" && dest.protocol !== "https:") dest = null;
  } catch {
    dest = null;
  }

  // Record the click (best-effort — never block the redirect on logging).
  try {
    if (token) {
      const msg = await prisma.message.findFirst({ where: { trackToken: token }, select: { id: true, firstClickAt: true } });
      if (msg) {
        await prisma.message.update({
          where: { id: msg.id },
          data: { clickCount: { increment: 1 }, ...(msg.firstClickAt ? {} : { firstClickAt: new Date() }) },
        });
        await prisma.messageEvent.create({
          data: { messageId: msg.id, url: dest?.toString().slice(0, 1000) ?? "", userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300) },
        });
      }
    }
  } catch (e) {
    log.warn("click tracking failed", { err: (e as Error).message });
  }

  if (!dest) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(dest.toString(), 302);
}
