import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";
import { encryptJson, decryptJson } from "@/lib/crypto";
import { testConnection } from "@/lib/providers/ai";
import { isCliAiKind } from "@/lib/providers/secrets";
import { audit } from "@/lib/audit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.string(), apiKey: z.string().optional(), baseUrl: z.string().optional(), cliPath: z.string().optional() }),
  z.object({ action: z.literal("test"), id: z.string() }),
  z.object({
    action: z.literal("model"),
    connectionId: z.string(),
    modelId: z.string(),
    allowed: z.boolean(),
    inputCostPerMTok: z.coerce.number().min(0).optional(),
    outputCostPerMTok: z.coerce.number().min(0).optional(),
  }),
  z.object({ action: z.literal("addModel"), connectionId: z.string(), modelId: z.string() }),
  z.object({ action: z.literal("assign"), task: z.string(), connectionId: z.string(), modelId: z.string() }),
  z.object({ action: z.literal("unassign"), task: z.string() }),
]);

export const POST = ownerRoute(async (req) => {
  const b = schema.parse(await req.json());

  if (b.action === "save") {
    const conn = await prisma.providerConnection.findUniqueOrThrow({ where: { id: b.id } });
    const existing = (conn.configEnc ? decryptJson<Record<string, string>>(conn.configEnc) : {}) ?? {};
    const next = { ...existing };
    if (b.apiKey !== undefined) {
      if (b.apiKey === "") delete next.apiKey;
      else next.apiKey = b.apiKey;
    }
    if (b.baseUrl !== undefined) next.baseUrl = b.baseUrl;
    if (b.cliPath !== undefined) {
      if (b.cliPath.trim() === "") delete next.cliPath;
      else next.cliPath = b.cliPath.trim();
    }
    // CLI providers have no API key; a path is optional and the CLI can be on
    // PATH, so never force them back to UNCONFIGURED on save. Key providers go
    // UNCONFIGURED when their key is cleared.
    const status = isCliAiKind(conn.kind) ? conn.status : next.apiKey ? conn.status : "UNCONFIGURED";
    await prisma.providerConnection.update({
      where: { id: b.id },
      data: { configEnc: encryptJson(next), status },
    });
    await audit("owner", "connection_save", "ProviderConnection", b.id, `Updated credentials for ${conn.kind}`);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "test") {
    const conn = await prisma.providerConnection.findUniqueOrThrow({ where: { id: b.id } });
    const result = await testConnection(conn);
    if (result.ok) {
      const models = result.models ?? [];
      await prisma.providerConnection.update({
        where: { id: b.id },
        data: {
          status: "CONNECTED",
          lastTestedAt: new Date(),
          lastError: "",
          connectionType: isCliAiKind(conn.kind) ? "cli-subscription" : "api",
          meta: { discoveredModels: models, discoveredAt: new Date().toISOString() },
        },
      });
      // Create permission rows for newly discovered models (default: not allowed).
      for (const m of models) {
        await prisma.modelPermission.upsert({
          where: { connectionId_modelId: { connectionId: b.id, modelId: m } },
          create: { connectionId: b.id, modelId: m, allowed: false },
          update: {},
        });
      }
    } else {
      await prisma.providerConnection.update({
        where: { id: b.id },
        data: { status: "ERROR", lastTestedAt: new Date(), lastError: result.error ?? "Unknown error" },
      });
    }
    return NextResponse.json(result);
  }

  if (b.action === "addModel") {
    await prisma.modelPermission.upsert({
      where: { connectionId_modelId: { connectionId: b.connectionId, modelId: b.modelId } },
      create: { connectionId: b.connectionId, modelId: b.modelId, allowed: true },
      update: { allowed: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "model") {
    await prisma.modelPermission.upsert({
      where: { connectionId_modelId: { connectionId: b.connectionId, modelId: b.modelId } },
      create: {
        connectionId: b.connectionId,
        modelId: b.modelId,
        allowed: b.allowed,
        inputCostPerMTok: b.inputCostPerMTok,
        outputCostPerMTok: b.outputCostPerMTok,
      },
      update: {
        allowed: b.allowed,
        ...(b.inputCostPerMTok != null ? { inputCostPerMTok: b.inputCostPerMTok } : {}),
        ...(b.outputCostPerMTok != null ? { outputCostPerMTok: b.outputCostPerMTok } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "assign") {
    // Enforce: assigned model must be on the allowlist.
    const perm = await prisma.modelPermission.findUnique({
      where: { connectionId_modelId: { connectionId: b.connectionId, modelId: b.modelId } },
    });
    if (!perm || !perm.allowed) return NextResponse.json({ error: "Model is not on the allowlist." }, { status: 400 });
    // Global assignment (campaignId null) can't use the compound-unique upsert.
    const existing = await prisma.modelAssignment.findFirst({ where: { task: b.task as any, campaignId: null } });
    if (existing) {
      await prisma.modelAssignment.update({ where: { id: existing.id }, data: { connectionId: b.connectionId, modelId: b.modelId } });
    } else {
      await prisma.modelAssignment.create({ data: { task: b.task as any, connectionId: b.connectionId, modelId: b.modelId } });
    }
    return NextResponse.json({ ok: true });
  }

  if (b.action === "unassign") {
    await prisma.modelAssignment.deleteMany({ where: { task: b.task as any, campaignId: null } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
});
