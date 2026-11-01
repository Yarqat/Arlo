import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/crypto";
import { ownerRoute } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({ current: z.string().min(1), next: z.string().min(10) });

export const POST = ownerRoute(async (req, { owner }) => {
  const { current, next } = schema.parse(await req.json());
  if (!verifyPassword(current, owner.passwordHash)) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }
  await prisma.owner.update({ where: { id: owner.id }, data: { passwordHash: hashPassword(next) } });
  await audit("owner", "password_change", "Owner", owner.id, "Password changed");
  return NextResponse.json({ ok: true });
});
