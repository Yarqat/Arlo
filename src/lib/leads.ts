import { prisma } from "./db";
import { canonicalDomain, dedupeKey, normalizeEmail, classifyEmailType } from "./dedup";
import { isSuppressed } from "./suppression";
import { audit } from "./audit";

export interface LeadRecord {
  businessName: string;
  website?: string;
  email?: string;
  contactName?: string;
  role?: string;
  phone?: string;
  city?: string;
  region?: string;
  country?: string;
  category?: string;
  address?: string;
  sourceUrl?: string;
  discoveryMethod?: string;
  matchExplanation?: string;
}

export interface ImportSummary {
  imported: number;
  merged: number;
  duplicates: number;
  contactsAdded: number;
  suppressedSkipped: number;
  noEmail: number;
}

export async function ensureSource(name: string, kind: string) {
  return prisma.leadSource.upsert({ where: { name }, create: { name, kind }, update: {} });
}

/**
 * Import/merge lead records. Dedupe by business identity (canonical domain + city);
 * a business stays one Lead even with several emails. Suppressed emails are never
 * silently re-activated as sendable contacts.
 */
export async function importLeads(
  records: LeadRecord[],
  opts: { sourceName: string; sourceKind: string; campaignId?: string | null; requireEmail?: boolean },
): Promise<ImportSummary> {
  const source = await ensureSource(opts.sourceName, opts.sourceKind);
  const sum: ImportSummary = { imported: 0, merged: 0, duplicates: 0, contactsAdded: 0, suppressedSkipped: 0, noEmail: 0 };

  for (const rec of records) {
    const name = rec.businessName?.trim();
    if (!name) continue;
    // A suppressed address is off-limits: never create a lead, contact or research
    // job for it (manual opt-out, bounce, unsubscribe). If the same business has
    // other, non-suppressed emails, those records still import it normally.
    if (rec.email && rec.email.includes("@") && (await isSuppressed(rec.email))) {
      sum.suppressedSkipped++;
      continue;
    }
    const key = dedupeKey({ website: rec.website, email: rec.email, businessName: name, city: rec.city });
    const domain = canonicalDomain(rec.website || "") || (rec.email ? canonicalDomain(rec.email) : null);

    let lead = await prisma.lead.findUnique({ where: { dedupeKey: key } });
    let isNew = false;
    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          businessName: name,
          website: rec.website ?? "",
          canonicalDomain: domain,
          dedupeKey: key,
          category: rec.category ?? "",
          country: rec.country ?? "",
          region: rec.region ?? "",
          city: rec.city ?? "",
          address: rec.address ?? "",
          phone: rec.phone ?? "",
          sourceId: source.id,
          discoverySourceUrl: rec.sourceUrl ?? "",
          discoveryMethod: rec.discoveryMethod ?? opts.sourceKind,
          matchExplanation: rec.matchExplanation ?? "",
        },
      });
      isNew = true;
      sum.imported++;
    } else {
      sum.merged++;
      // Backfill blank fields without overwriting existing data.
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          website: lead.website || rec.website || "",
          canonicalDomain: lead.canonicalDomain || domain,
          phone: lead.phone || rec.phone || "",
          category: lead.category || rec.category || "",
          address: lead.address || rec.address || "",
        },
      });
    }

    // Contact
    let hadEmail = false;
    if (rec.email && rec.email.includes("@")) {
      const email = normalizeEmail(rec.email);
      hadEmail = true;
      const exists = await prisma.contact.findUnique({ where: { leadId_email: { leadId: lead.id, email } } });
      if (exists) {
        if (!isNew) sum.duplicates++;
      } else {
        // Suppressed addresses were already skipped above, so anything reaching
        // here is contactable.
        await prisma.contact.create({
          data: {
            leadId: lead.id,
            name: rec.contactName ?? "",
            role: rec.role ?? "",
            email,
            emailType: classifyEmailType(email, !!rec.contactName) as any,
            source: opts.sourceName,
            sourceUrl: rec.sourceUrl ?? "",
            isPrimary: isNew,
          },
        });
        sum.contactsAdded++;
      }
    } else if (!isNew) {
      sum.duplicates++;
    }

    if (!hadEmail) {
      const contactCount = await prisma.contact.count({ where: { leadId: lead.id } });
      if (contactCount === 0) {
        sum.noEmail++;
        if (opts.requireEmail) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { qualification: "EXCLUDED_NO_EMAIL", exclusionReason: "No public email found" },
          });
        }
      }
    }

    if (opts.campaignId) {
      await prisma.campaignMembership
        .upsert({
          where: { campaignId_leadId: { campaignId: opts.campaignId, leadId: lead.id } },
          create: { campaignId: opts.campaignId, leadId: lead.id },
          update: {},
        })
        .catch(() => {});
      if (!lead.primaryCampaignId) {
        await prisma.lead.update({ where: { id: lead.id }, data: { primaryCampaignId: opts.campaignId } });
      }
    }
  }

  if (sum.duplicates > 0) {
    await audit("owner", "dedupe_rejected", "Lead", "", `${sum.duplicates} duplicate rows skipped during import`, sum);
  }
  await audit("owner", "import", "LeadSource", source.id, `Imported from ${opts.sourceName}`, sum);
  return sum;
}
