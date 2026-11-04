import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { stageTone, stageLabel } from "@/lib/labels";
import { buildLeadWhere } from "@/lib/lead-filter";
import { Users, Upload, Globe, X } from "lucide-react";
import { relativeTime } from "@/lib/time";
import { BulkBar } from "./bulk-bar";

export const dynamic = "force-dynamic";

const STAGES = ["NEW","RESEARCHING","QUALIFIED","READY_FOR_REVIEW","SCHEDULED","CONTACTED","REPLIED","INTERESTED","MEETING_REQUESTED","MEETING_BOOKED","PROPOSAL_NEEDED","WON","LOST","NOT_INTERESTED","SUPPRESSED"];
const QUALS = ["PENDING","QUALIFIED","DISQUALIFIED","NEEDS_REVIEW","EXCLUDED_NO_EMAIL"];
const SORTS: Record<string, { label: string; orderBy: Record<string, "asc" | "desc"> }> = {
  updated: { label: "Recently updated", orderBy: { updatedAt: "desc" } },
  created: { label: "Newest added", orderBy: { createdAt: "desc" } },
  name: { label: "Name A–Z", orderBy: { businessName: "asc" } },
  stage: { label: "Stage", orderBy: { stage: "asc" } },
};
const qualLabel = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

type SP = { stage?: string; q?: string; page?: string; campaign?: string; qualification?: string; hasContact?: string; sort?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const hasContact = sp.hasContact === "yes" || sp.hasContact === "no" ? (sp.hasContact as "yes" | "no") : undefined;
  const filter = { stage: sp.stage, q: sp.q, campaign: sp.campaign, qualification: sp.qualification, hasContact };
  const where = buildLeadWhere(filter);
  const sortKey = sp.sort && SORTS[sp.sort] ? sp.sort : "updated";

  const PER = 50;
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  const [leads, total, matchCount, campaigns] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: SORTS[sortKey].orderBy,
      skip: (page - 1) * PER,
      take: PER,
      include: { contacts: { take: 1 }, _count: { select: { contacts: true } } },
    }),
    prisma.lead.count(),
    prisma.lead.count({ where }),
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(matchCount / PER));
  const campaignName = (id?: string) => campaigns.find((c) => c.id === id)?.name;

  // Build a URL preserving all active params, with optional overrides.
  const url = (over: Partial<SP>) => {
    const u = new URLSearchParams();
    const merged: SP = { ...sp, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, String(v));
    const s = u.toString();
    return `/leads${s ? `?${s}` : ""}`;
  };

  const activeFilters = [
    sp.q && { key: "q", label: `“${sp.q}”` },
    sp.stage && { key: "stage", label: stageLabel(sp.stage) },
    sp.qualification && { key: "qualification", label: qualLabel(sp.qualification) },
    sp.campaign && { key: "campaign", label: campaignName(sp.campaign) || "Campaign" },
    hasContact && { key: "hasContact", label: hasContact === "yes" ? "Has contact" : "No contact" },
  ].filter(Boolean) as { key: string; label: string }[];

  const selectCls = "h-10 rounded-xl border border-border-strong bg-surface px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leads"
        description={`${total.toLocaleString()} ${total === 1 ? "business" : "businesses"} in your pipeline.`}
        actions={
          <Link href="/leads/import">
            <Button variant="outline"><Upload className="size-4" /> Import CSV</Button>
          </Link>
        }
      />

      {/* Filter bar */}
      <Card className="p-4">
        <form className="flex flex-wrap items-end gap-2" action="/leads">
          <div className="min-w-[14rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Search</label>
            <input name="q" defaultValue={sp.q} placeholder="Business, domain, or city…" className={`${selectCls} w-full`} />
          </div>
          <select name="stage" defaultValue={sp.stage || ""} className={selectCls} aria-label="Stage">
            <option value="">Any stage</option>
            {STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
          </select>
          <select name="campaign" defaultValue={sp.campaign || ""} className={selectCls} aria-label="Campaign">
            <option value="">Any campaign</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="qualification" defaultValue={sp.qualification || ""} className={selectCls} aria-label="Qualification">
            <option value="">Any qualification</option>
            {QUALS.map((s) => <option key={s} value={s}>{qualLabel(s)}</option>)}
          </select>
          <select name="hasContact" defaultValue={sp.hasContact || ""} className={selectCls} aria-label="Contact">
            <option value="">Any contact</option>
            <option value="yes">Has contact</option>
            <option value="no">No contact</option>
          </select>
          <select name="sort" defaultValue={sortKey} className={selectCls} aria-label="Sort">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>

        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted">{matchCount.toLocaleString()} match{matchCount === 1 ? "" : "es"} ·</span>
            {activeFilters.map((f) => (
              <Link key={f.key} href={url({ [f.key]: undefined, page: undefined } as Partial<SP>)} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium hover:bg-border">
                {f.label} <X className="size-3" />
              </Link>
            ))}
            <Link href="/leads" className="text-xs text-primary hover:underline">Clear all</Link>
          </div>
        )}
      </Card>

      {leads.length > 0 && <BulkBar matchCount={matchCount} stage={sp.stage} q={sp.q} campaign={sp.campaign} qualification={sp.qualification} hasContact={hasContact} />}

      {leads.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={activeFilters.length ? "No leads match these filters" : "No leads yet"}
          description={activeFilters.length ? "Try widening your filters, or clear them to see everything." : "Import a CSV of businesses, or describe a discovery campaign in plain English and let the assistant find them."}
          action={
            activeFilters.length ? (
              <Link href="/leads"><Button variant="outline">Clear filters</Button></Link>
            ) : (
              <div className="flex gap-2">
                <Link href="/leads/import"><Button variant="outline">Import CSV</Button></Link>
                <Link href="/campaigns/new"><Button>Describe a campaign</Button></Link>
              </div>
            )
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <THead>
              <TR><TH>Business</TH><TH>Location</TH><TH>Contacts</TH><TH>Stage</TH><TH>Updated</TH></TR>
            </THead>
            <TBody>
              {leads.map((l) => (
                <TR key={l.id}>
                  <TD>
                    <Link href={`/leads/${l.id}`} className="font-medium hover:text-primary">{l.businessName}</Link>
                    {l.canonicalDomain && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-2"><Globe className="size-3" /> {l.canonicalDomain}</span>
                    )}
                  </TD>
                  <TD className="text-muted">{[l.city, l.country].filter(Boolean).join(", ") || "—"}</TD>
                  <TD className="text-muted">{l._count.contacts}</TD>
                  <TD><Badge tone={stageTone(l.stage)}>{stageLabel(l.stage)}</Badge></TD>
                  <TD className="text-xs text-muted-2">{relativeTime(l.updatedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {matchCount > PER && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>Showing {(page - 1) * PER + 1}–{Math.min(page * PER, matchCount)} of {matchCount.toLocaleString()}</span>
          <div className="flex items-center gap-2">
            {page > 1 ? <Link href={url({ page: String(page - 1) })}><Button variant="outline" size="sm">Previous</Button></Link> : <Button variant="outline" size="sm" disabled>Previous</Button>}
            <span className="px-1 text-xs">Page {page} of {totalPages}</span>
            {page < totalPages ? <Link href={url({ page: String(page + 1) })}><Button variant="outline" size="sm">Next</Button></Link> : <Button variant="outline" size="sm" disabled>Next</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
