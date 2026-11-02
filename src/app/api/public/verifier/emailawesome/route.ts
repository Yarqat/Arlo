import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { verifierWebhookSecret, mapEmailAwesomeStatus } from "@/lib/providers/verifier";
import { audit } from "@/lib/audit";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Public results webhook for Email Awesome (asynchronous verification).
 * The URL is public, so we authenticate the shared bearer secret BEFORE trusting
 * the body, then flip the matching PENDING verification to its verdict. The body
 * is treated strictly as untrusted data. We always ack quickly with 2xx on
 * authenticated calls so the provider does not retry-storm.
 */
export async function POST(req: NextRequest) {
  const conn = await prisma.providerConnection.findFirst({ where: { kind: "EMAIL_VERIFIER" } });
  const secret = conn ? verifierWebhookSecret(conn) : null;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !constantTimeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const v = body?.validation;
  if (!v || (!v.id && !v.email_address)) {
    return NextResponse.json({ ok: true }); // nothing to match; acknowledge
  }

  try {
    // Match by the provider's validation id first; fall back to the most recent
    // pending result for that email address.
    let rec =
      v.id
        ? await prisma.verificationResult.findFirst({ where: { externalId: String(v.id), status: "PENDING" } })
        : null;
    if (!rec && v.email_address) {
      rec = await prisma.verificationResult.findFirst({
        where: { provider: "emailawesome", status: "PENDING", contact: { email: String(v.email_address) } },
        orderBy: { checkedAt: "desc" },
      });
    }

    if (rec) {
      // Only a COMPLETE job carries a verdict; FAILED / FAILED EXPIRED → risky.
      const status =
        String(v.status || "").toUpperCase() === "COMPLETE"
          ? mapEmailAwesomeStatus(String(v.email_address_status || ""))
          : "UNKNOWN";
      const settings = await getSettings();
      await prisma.verificationResult.update({
        where: { id: rec.id },
        data: {
          status,
          isCatchAll: status === "CATCH_ALL",
          raw: v as object,
          checkedAt: new Date(),
          staleAfter: new Date(Date.now() + settings.verificationStaleDays * 86400_000),
        },
      });
      await audit("system", "verify_webhook", "VerificationResult", rec.id, `Email Awesome: ${v.email_address} → ${status}`);
    }
  } catch (e) {
    // Log and still acknowledge: a 2xx is required promptly, and a retry would
    // not change a persistent error.
    log.error("verifier webhook", { err: (e as Error).message });
  }

  return NextResponse.json({ ok: true });
}
