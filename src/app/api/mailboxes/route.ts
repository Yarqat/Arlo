import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { encryptJson, decryptJson } from "@/lib/crypto";
import { testSmtp, testImap, smtpOf, imapOf } from "@/lib/providers/email";
import { audit } from "@/lib/audit";

const cfg = z.object({
  // Strip whitespace and any stray leading junk (e.g. a pasted "=") so a bad
  // paste can't produce an unresolvable hostname (DNS EBADNAME).
  host: z.string().min(1).transform((s) => s.trim().replace(/^[^A-Za-z0-9]+/, "").replace(/\s+/g, "")),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1),
  pass: z.string().optional(), // optional on update = keep existing
});

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.string().optional(),
    senderName: z.string().min(1).max(200),
    email: z.string().email(),
    signature: z.string().max(2000).optional(),
    providerType: z.enum(["smtp", "ses"]).default("smtp"),
    dailyLimit: z.coerce.number().int().min(0).default(50),
    hourlyLimit: z.coerce.number().int().min(0).default(15),
    smtp: cfg,
    // IMAP is optional: a send-only mailbox is allowed, but then Arlo cannot
    // monitor replies (no reply classification, follow-up auto-pause or inbox).
    imap: cfg.nullable().optional(),
  }),
  z.object({ action: z.literal("test"), id: z.string() }),
  z.object({ action: z.literal("delete"), id: z.string() }),
]);

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());

  if (b.action === "delete") {
    await prisma.mailbox.delete({ where: { id: b.id } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (b.action === "test") {
    const mb = await prisma.mailbox.findUniqueOrThrow({ where: { id: b.id } });
    const [smtp, imap] = [smtpOf(mb), imapOf(mb)];
    const smtpRes = smtp ? await testSmtp(smtp) : { ok: false, error: "No SMTP config" };
    // No IMAP configured is a valid (send-only) state, not a failure.
    const imapRes = imap ? await testImap(imap) : { ok: true, error: "not configured" };
    const ok = smtpRes.ok && imapRes.ok;
    const imapLabel = !imap ? "send-only" : imapRes.ok ? "ok" : imapRes.error;
    await prisma.mailbox.update({
      where: { id: b.id },
      data: {
        status: ok ? "CONNECTED" : "ERROR",
        lastTestedAt: new Date(),
        lastError: ok ? "" : `SMTP: ${smtpRes.ok ? "ok" : smtpRes.error}; IMAP: ${imapLabel}`,
      },
    });
    return NextResponse.json({ ok, smtp: smtpRes, imap: { ...imapRes, configured: !!imap } });
  }

  // save
  const existing = b.id ? await prisma.mailbox.findUnique({ where: { id: b.id } }) : null;
  const prevSmtp = existing ? smtpOf(existing) : null;
  const prevImap = existing ? imapOf(existing) : null;
  const smtpFull = { ...b.smtp, pass: b.smtp.pass || prevSmtp?.pass || "" };
  if (!smtpFull.pass) {
    return NextResponse.json({ error: "An SMTP password is required to send email." }, { status: 400 });
  }

  // IMAP is optional. When omitted (null), the mailbox is send-only and we clear
  // any stored IMAP config. When provided, its password is required.
  let imapEnc: string | null = existing?.imapConfigEnc ?? null;
  if (b.imap === null) {
    imapEnc = null;
  } else if (b.imap) {
    const imapFull = { ...b.imap, pass: b.imap.pass || prevImap?.pass || "" };
    if (!imapFull.pass) {
      return NextResponse.json({ error: "An IMAP password is required, or turn off reply monitoring to save a send-only mailbox." }, { status: 400 });
    }
    imapEnc = encryptJson(imapFull);
  }

  const data = {
    senderName: b.senderName,
    email: b.email.toLowerCase(),
    signature: b.signature ?? "",
    providerType: b.providerType,
    dailyLimit: b.dailyLimit,
    hourlyLimit: b.hourlyLimit,
    smtpConfigEnc: encryptJson(smtpFull),
    imapConfigEnc: imapEnc,
  };

  const mb = b.id
    ? await prisma.mailbox.update({ where: { id: b.id }, data })
    : await prisma.mailbox.create({ data });
  await audit("owner", "mailbox_save", "Mailbox", mb.id, `Saved mailbox ${mb.email}`);
  return NextResponse.json({ ok: true, id: mb.id });
});
