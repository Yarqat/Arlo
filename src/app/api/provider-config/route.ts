import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { encryptJson, decryptJson } from "@/lib/crypto";
import { testSearch } from "@/lib/providers/search";
import { testVerifier } from "@/lib/providers/verifier";
import { testStt, testTts } from "@/lib/providers/speech";
import { audit } from "@/lib/audit";

const schema = z.object({
  action: z.enum(["save", "test"]),
  kind: z.enum(["SEARCH", "EMAIL_VERIFIER", "SPEECH_STT", "SPEECH_TTS"]),
  provider: z.string().max(40).optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  // speech-only config
  model: z.string().max(80).optional(),
  voice: z.string().max(120).optional(),
  costPerMinute: z.string().max(20).optional(),
  costPerKChar: z.string().max(20).optional(),
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
    // Optional speech fields (empty string clears).
    for (const f of ["model", "voice", "costPerMinute", "costPerKChar"] as const) {
      if (b[f] !== undefined) {
        if (b[f] === "") delete next[f];
        else next[f] = b[f] as string;
      }
    }
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
  const result =
    b.kind === "SEARCH" ? await testSearch(fresh)
    : b.kind === "EMAIL_VERIFIER" ? await testVerifier(fresh)
    : b.kind === "SPEECH_STT" ? await testStt(fresh)
    : await testTts(fresh);
  await prisma.providerConnection.update({
    where: { id: conn.id },
    data: result.ok
      ? { status: "CONNECTED", lastTestedAt: new Date(), lastError: "" }
      : { status: "ERROR", lastTestedAt: new Date(), lastError: result.error ?? "Failed" },
  });
  return NextResponse.json(result);
});
