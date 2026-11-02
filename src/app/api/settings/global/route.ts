import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";

const num = z.coerce.number().min(0);
const schema = z.object({
  timezone: z.string().max(64).optional(),
  dailySpendLimit: num.optional(),
  monthlySpendLimit: num.optional(),
  dailyAiRequests: num.int().optional(),
  dailyTokens: num.int().optional(),
  dailyNewLeads: num.int().optional(),
  dailyResearch: num.int().optional(),
  dailyEmail: num.int().optional(),
  hourlyEmail: num.int().optional(),
  maxFollowUps: num.int().optional(),
  maxPagesPerLead: num.int().optional(),
  maxRetriesPerJob: num.int().optional(),
  maxJobSeconds: num.int().optional(),
  verificationStaleDays: num.int().optional(),
  unsubscribeFooter: z.string().max(1000).optional(),
  retentionDays: num.int().optional(),
  blockRemoteImages: z.boolean().optional(),
  // Assistant (Arlo) + voice
  assistantName: z.string().max(40).optional(),
  assistantSpeakByDefault: z.boolean().optional(),
  dailyBriefingEnabled: z.boolean().optional(),
  dailyBriefingHour: num.int().min(0).max(23).optional(),
});

export const POST = ownerRoute(async (req) => {
  const data = schema.parse(await req.json());
  await prisma.globalSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton", ...data }, update: data });
  return NextResponse.json({ ok: true });
});
