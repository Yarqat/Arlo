import { prisma } from "./db";
import { getSettings } from "./settings";
import { dayKey, monthKey } from "./time";
import { Prisma, UsageKind } from "@prisma/client";

export class BudgetExceededError extends Error {
  constructor(public detail: string, public nextEligibleAt?: Date) {
    super("Budget or rate limit reached: " + detail);
    this.name = "BudgetExceededError";
  }
}
export class EmergencyPausedError extends Error {
  constructor() {
    super("Emergency pause is active");
    this.name = "EmergencyPausedError";
  }
}

export interface Reservation {
  id: string;
  commit: (actualCost: number, meta?: { provider?: string; model?: string; tokensIn?: number; tokensOut?: number; count?: number }) => Promise<void>;
  release: () => Promise<void>;
}

interface ReserveInput {
  kind: UsageKind;
  campaignId?: string | null;
  estimatedCost?: number; // USD
  estimatedCount?: number; // units (emails, leads, requests)
  reference?: string;
  provider?: string;
  model?: string;
  note?: string;
  /** skip the emergency-pause check (used for inbound-only tasks) */
  allowWhenPaused?: boolean;
}

/**
 * Atomically reserve budget/quota against GLOBAL and (optionally) campaign scope.
 * Uses a single transaction with SELECT ... FOR UPDATE on the day/kind counter
 * rows so concurrent jobs cannot collectively overspend.
 */
export async function reserve(input: ReserveInput): Promise<Reservation> {
  const settings = await getSettings();
  if (settings.emergencyPause && !input.allowWhenPaused) throw new EmergencyPausedError();

  const tz = settings.timezone;
  const day = dayKey(tz);
  const month = monthKey(tz);
  const estCost = input.estimatedCost ?? 0;
  const estCount = input.estimatedCount ?? 1;

  // Per-kind daily COUNT limits (global).
  const countLimit: Partial<Record<UsageKind, number>> = {
    AI: settings.dailyAiRequests,
    LEAD: settings.dailyNewLeads,
    RESEARCH: settings.dailyResearch,
    EMAIL: settings.dailyEmail,
  };

  const scopes: { scope: string; dailySpend?: number; countCap?: number }[] = [
    { scope: "GLOBAL", dailySpend: Number(settings.dailySpendLimit), countCap: countLimit[input.kind] },
  ];
  if (input.campaignId) {
    const c = await prisma.campaign.findUnique({ where: { id: input.campaignId } });
    if (c?.dailySpendLimit != null) scopes.push({ scope: input.campaignId, dailySpend: Number(c.dailySpendLimit) });
    if (input.kind === "EMAIL" && c?.dailyEmailLimit != null) {
      const s = scopes.find((x) => x.scope === input.campaignId);
      if (s) s.countCap = c.dailyEmailLimit;
      else scopes.push({ scope: input.campaignId, countCap: c.dailyEmailLimit });
    }
  }

  const reservationId = await prisma.$transaction(async (tx) => {
    // Monthly global spend guard.
    if (estCost > 0) {
      const monthRows = await tx.budgetCounter.findMany({ where: { scope: "GLOBAL", day: { startsWith: month } } });
      const monthSpent = monthRows.reduce((s, r) => s + Number(r.reservedCost) + Number(r.spentCost), 0);
      if (monthSpent + estCost > Number(settings.monthlySpendLimit)) {
        throw new BudgetExceededError(`monthly spend limit ($${settings.monthlySpendLimit})`);
      }
    }

    for (const sc of scopes) {
      // lock-or-create the counter row
      await tx.$executeRaw`
        INSERT INTO "BudgetCounter" ("id","scope","day","kind","reservedCost","spentCost","reservedCount","spentCount","updatedAt")
        VALUES (${crypto.randomUUID()}, ${sc.scope}, ${day}, ${input.kind}::"UsageKind", 0, 0, 0, 0, now())
        ON CONFLICT ("scope","day","kind") DO NOTHING`;
      const rows = await tx.$queryRaw<
        { id: string; reservedCost: Prisma.Decimal; spentCost: Prisma.Decimal; reservedCount: number; spentCount: number }[]
      >`SELECT "id","reservedCost","spentCost","reservedCount","spentCount"
          FROM "BudgetCounter"
          WHERE "scope"=${sc.scope} AND "day"=${day} AND "kind"=${input.kind}::"UsageKind"
          FOR UPDATE`;
      const row = rows[0];

      if (sc.dailySpend != null && estCost > 0) {
        const used = Number(row.reservedCost) + Number(row.spentCost);
        if (used + estCost > sc.dailySpend) {
          throw new BudgetExceededError(`daily spend limit for ${sc.scope === "GLOBAL" ? "account" : "campaign"} ($${sc.dailySpend})`);
        }
      }
      if (sc.countCap != null) {
        const usedCount = row.reservedCount + row.spentCount;
        if (usedCount + estCount > sc.countCap) {
          throw new BudgetExceededError(`daily ${input.kind.toLowerCase()} limit (${sc.countCap})`);
        }
      }

      await tx.budgetCounter.update({
        where: { id: row.id },
        data: { reservedCost: { increment: estCost }, reservedCount: { increment: estCount } },
      });
    }

    const res = await tx.usageReservation.create({
      data: {
        kind: input.kind,
        scope: input.campaignId ?? "GLOBAL",
        day,
        estimatedCost: estCost,
        estimatedCount: estCount,
        reference: input.reference ?? "",
        provider: input.provider ?? "",
        model: input.model ?? "",
        note: input.note ?? "",
        status: "RESERVED",
      },
    });
    return res.id;
  });

  const scopesCopy = scopes.map((s) => s.scope);

  return {
    id: reservationId,
    async commit(actualCost, meta) {
      await prisma.$transaction(async (tx) => {
        const r = await tx.usageReservation.findUnique({ where: { id: reservationId } });
        if (!r || r.status !== "RESERVED") return;
        for (const scope of scopesCopy) {
          await tx.budgetCounter.updateMany({
            where: { scope, day, kind: input.kind },
            data: {
              reservedCost: { decrement: Number(r.estimatedCost) },
              reservedCount: { decrement: r.estimatedCount },
              spentCost: { increment: actualCost },
              spentCount: { increment: meta?.count ?? r.estimatedCount },
            },
          });
        }
        await tx.usageReservation.update({
          where: { id: reservationId },
          data: { status: "COMMITTED", actualCost, committedAt: new Date() },
        });
        await tx.usageLedger.create({
          data: {
            day,
            kind: input.kind,
            scope: input.campaignId ?? "GLOBAL",
            provider: meta?.provider ?? input.provider ?? "",
            model: meta?.model ?? input.model ?? "",
            requests: input.kind === "AI" ? 1 : 0,
            tokensIn: meta?.tokensIn ?? 0,
            tokensOut: meta?.tokensOut ?? 0,
            cost: actualCost,
            count: meta?.count ?? r.estimatedCount,
          },
        });
      });
    },
    async release() {
      await prisma.$transaction(async (tx) => {
        const r = await tx.usageReservation.findUnique({ where: { id: reservationId } });
        if (!r || r.status !== "RESERVED") return;
        for (const scope of scopesCopy) {
          await tx.budgetCounter.updateMany({
            where: { scope, day, kind: input.kind },
            data: {
              reservedCost: { decrement: Number(r.estimatedCost) },
              reservedCount: { decrement: r.estimatedCount },
            },
          });
        }
        await tx.usageReservation.update({ where: { id: reservationId }, data: { status: "RELEASED" } });
      });
    },
  };
}
