import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { importLeads } from "@/lib/leads";
import { suppress, isSuppressed } from "@/lib/suppression";
import { reserve, BudgetExceededError } from "@/lib/budget";
import { runAiTask, NoModelAssignedError, ModelNotAllowedError } from "@/lib/providers/ai";

const TABLES = [
  "Message", "Thread", "ScheduledAction", "ResearchFinding", "VerificationResult", "Contact",
  "CampaignMembership", "LeadStageEvent", "Lead", "Campaign", "LeadSource", "SuppressionRecord",
  "BudgetCounter", "UsageReservation", "UsageLedger", "ModelAssignment", "ModelPermission",
  "ProviderConnection", "AuditEvent", "GlobalSettings",
];

async function reset() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
  await prisma.globalSettings.create({ data: { id: "singleton" } });
}

beforeEach(reset);
afterAll(async () => prisma.$disconnect());

describe("import dedup", () => {
  it("keeps one lead for a business with multiple emails; rejects exact duplicates", async () => {
    const base = { sourceName: "test", sourceKind: "csv", requireEmail: true } as const;
    const r1 = await importLeads([{ businessName: "Acme", website: "acme.com", email: "a@acme.com", city: "London" }], base);
    expect(r1.imported).toBe(1);
    expect(r1.contactsAdded).toBe(1);

    const r2 = await importLeads([{ businessName: "Acme Ltd", website: "https://acme.com", email: "a@acme.com", city: "London" }], base);
    expect(r2.imported).toBe(0);
    expect(r2.duplicates).toBe(1);

    const r3 = await importLeads([{ businessName: "Acme", website: "acme.com", email: "sales@acme.com", city: "London" }], base);
    expect(r3.contactsAdded).toBe(1);

    expect(await prisma.lead.count()).toBe(1);
    expect(await prisma.contact.count()).toBe(2);
  });

  it("treats a different city as a distinct branch", async () => {
    const base = { sourceName: "test", sourceKind: "csv", requireEmail: true } as const;
    await importLeads([{ businessName: "Acme", website: "acme.com", email: "a@acme.com", city: "London" }], base);
    await importLeads([{ businessName: "Acme", website: "acme.com", email: "a@acme.com", city: "Leeds" }], base);
    expect(await prisma.lead.count()).toBe(2);
  });
});

describe("suppression", () => {
  it("cancels queued outreach across campaigns and survives reimport", async () => {
    await importLeads([{ businessName: "Acme", website: "acme.com", email: "a@acme.com", city: "London" }], { sourceName: "t", sourceKind: "csv", requireEmail: true });
    const lead = await prisma.lead.findFirstOrThrow();
    const contact = await prisma.contact.findFirstOrThrow();
    const c1 = await prisma.campaign.create({ data: { name: "c1" } });
    const c2 = await prisma.campaign.create({ data: { name: "c2" } });
    await prisma.scheduledAction.createMany({
      data: [
        { type: "SEND_OUTREACH", status: "SCHEDULED", leadId: lead.id, contactId: contact.id, campaignId: c1.id, idempotencyKey: "k1" },
        { type: "FOLLOW_UP", status: "SCHEDULED", leadId: lead.id, contactId: contact.id, campaignId: c2.id, idempotencyKey: "k2" },
      ],
    });

    await suppress({ email: "a@acme.com", reason: "HARD_BOUNCE", source: "dsn" });

    const remaining = await prisma.scheduledAction.count({ where: { status: "SCHEDULED" } });
    expect(remaining).toBe(0);
    expect(await isSuppressed("A@ACME.COM")).toBe(true);

    // Reimport must not reactivate.
    const r = await importLeads([{ businessName: "Acme", website: "acme.com", email: "a@acme.com", city: "London" }], { sourceName: "t", sourceKind: "csv", requireEmail: true });
    expect(r.suppressedSkipped).toBeGreaterThanOrEqual(0);
    expect(await isSuppressed("a@acme.com")).toBe(true);
  });

  it("does not downgrade an unsubscribe to manual on re-suppress", async () => {
    await suppress({ email: "x@y.com", reason: "UNSUBSCRIBE", source: "reply" });
    await suppress({ email: "x@y.com", reason: "MANUAL", source: "manual" });
    const rec = await prisma.suppressionRecord.findUniqueOrThrow({ where: { email: "x@y.com" } });
    expect(rec.reason).toBe("UNSUBSCRIBE");
  });
});

describe("budget reservations are concurrency-safe", () => {
  it("never collectively overspends the daily limit", async () => {
    await prisma.globalSettings.update({ where: { id: "singleton" }, data: { dailySpendLimit: 1 as any, monthlySpendLimit: 1000 as any } });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => reserve({ kind: "AI", estimatedCost: 0.3 })),
    );
    const granted = results.filter((r) => r.status === "fulfilled").length;
    const denied = results.filter((r) => r.status === "rejected" && (r as any).reason instanceof BudgetExceededError).length;
    expect(granted + denied).toBe(12);
    // 0.3 * granted must not exceed the 1.0 limit.
    expect(granted).toBeLessThanOrEqual(3);

    const counter = await prisma.budgetCounter.findFirstOrThrow({ where: { kind: "AI" } });
    expect(Number(counter.reservedCost)).toBeLessThanOrEqual(1.0001);
  });
});

describe("model allowlist enforcement", () => {
  it("throws when no model is assigned", async () => {
    await expect(runAiTask({ task: "OUTREACH_WRITING", messages: [{ role: "user", content: "hi" }] })).rejects.toBeInstanceOf(NoModelAssignedError);
  });

  it("refuses a model that is not on the allowlist", async () => {
    const conn = await prisma.providerConnection.create({ data: { kind: "AI_OPENAI", name: "default", status: "CONNECTED" } });
    await prisma.modelPermission.create({ data: { connectionId: conn.id, modelId: "gpt-x", allowed: false } });
    await prisma.modelAssignment.create({ data: { task: "OUTREACH_WRITING", connectionId: conn.id, modelId: "gpt-x" } });
    await expect(runAiTask({ task: "OUTREACH_WRITING", messages: [{ role: "user", content: "hi" }] })).rejects.toBeInstanceOf(ModelNotAllowedError);
  });
});
