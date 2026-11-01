import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { suppress } from "@/lib/suppression";
import { normalizeEmail } from "@/lib/dedup";
import { audit } from "@/lib/audit";

const schema = z.object({
  action: z.enum(["add", "remove"]),
  email: z.string().email(),
});

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());
  const email = normalizeEmail(b.email);
  if (b.action === "add") {
    await suppress({ email, reason: "MANUAL", source: "manual", detail: "added by owner" });
  } else {
    // Manual removal is allowed but explicitly audited. It does not reactivate any lead automatically.
    await prisma.suppressionRecord.delete({ where: { email } }).catch(() => {});
    await audit("owner", "suppression_remove", "Suppression", email, `Removed ${email} from suppression list`);
  }
  return NextResponse.json({ ok: true });
});
