import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerRoute } from "@/lib/api";

const schema = z.object({
  companyName: z.string().max(200).optional(),
  personName: z.string().max(200).optional(),
  roleTitle: z.string().max(200).optional(),
  bio: z.string().max(4000).optional(),
  website: z.string().max(300).optional(),
  defaultSignature: z.string().max(2000).optional(),
  writingPreferences: z.string().max(4000).optional(),
  prohibitedClaims: z.string().max(4000).optional(),
  timezone: z.string().max(64).optional(),
});

export const POST = ownerRoute(async (req) => {
  const data = schema.parse(await req.json());
  await prisma.businessProfile.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
  return NextResponse.json({ ok: true });
});
