import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { encryptJson, decryptJson } from "@/lib/crypto";
import { testSearch } from "@/lib/providers/search";
import { testVerifier } from "@/lib/providers/verifier";
import { audit } from "@/lib/audit";

const schema = z.object({
  action: z.enum(["save", "test"]),
  kind: z.enum(["SEARCH", "EMAIL_VERIFIER"]),
  provider: z.string().max(40).optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());
  const conn = await prisma.providerConnection.upsert({
    where: { kind_name: { kind: b.kind, name: "default" } },
    create: { kind: b.kind, name: "default" },
    update: {},
  });

  if (b.action === "save") {
    const existing = (conn.configEnc ? decryptJson<Record<string, string>>(conn.configEnc) : {}) ?? {};
    const next = { ...existing };
    if (b.apiKey !== undefined) {
      if (b.apiKey === "") delete next.apiKey;
      else next.apiKey = b.apiKey;
    }
    if (b.baseUrl !== undefined) next.baseUrl = b.baseUrl;
    await prisma.providerConnection.update({
      where: { id: conn.id },
      data: {
        configEnc: encryptJson(next),
        meta: { ...(conn.meta as object), provider: b.provider ?? (conn.meta as any)?.provider ?? "" },
        status: next.apiKey ? conn.status : "UNCONFIGURED",
      },
    });
    await audit("owner", "provider_save", "ProviderConnection", conn.id, `Updated ${b.kind} config`);
    return NextResponse.json({ ok: true });
  }

  // test
  const fresh = await prisma.providerConnection.findUniqueOrThrow({ where: { id: conn.id } });
  const result = b.kind === "SEARCH" ? await testSearch(fresh) : await testVerifier(fresh);
  await prisma.providerConnection.update({
    where: { id: conn.id },
    data: result.ok
      ? { status: "CONNECTED", lastTestedAt: new Date(), lastError: "" }
      : { status: "ERROR", lastTestedAt: new Date(), lastError: result.error ?? "Failed" },
  });
  return NextResponse.json(result);
});
