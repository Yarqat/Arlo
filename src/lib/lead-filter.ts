import { Prisma } from "@prisma/client";

export type LeadFilter = {
  stage?: string;
  q?: string;
  campaign?: string;
  qualification?: string;
  hasContact?: "yes" | "no";
};

/**
 * Single source of truth for the Leads filter, shared by the Leads page and the
 * bulk-actions API so a bulk run hits exactly the set the page is showing.
 */
export function buildLeadWhere(f: LeadFilter): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  if (f.stage) where.stage = f.stage as never;
  if (f.qualification) where.qualification = f.qualification as never;
  if (f.campaign) where.memberships = { some: { campaignId: f.campaign } };
  if (f.hasContact === "yes") where.contacts = { some: {} };
  if (f.hasContact === "no") where.contacts = { none: {} };
  if (f.q)
    where.OR = [
      { businessName: { contains: f.q, mode: "insensitive" } },
      { canonicalDomain: { contains: f.q, mode: "insensitive" } },
      { city: { contains: f.q, mode: "insensitive" } },
    ];
  return where;
}
