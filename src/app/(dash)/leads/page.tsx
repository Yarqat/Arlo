import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { stageTone, stageLabel } from "@/lib/labels";
import { Users, Upload, Globe } from "lucide-react";
import { relativeTime } from "@/lib/time";
import { BulkBar } from "./bulk-bar";

export const dynamic = "force-dynamic";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const where: Record<string, unknown> = {};
  if (sp.stage) where.stage = sp.stage;
  if (sp.q)
    where.OR = [
      { businessName: { contains: sp.q, mode: "insensitive" } },
      { canonicalDomain: { contains: sp.q, mode: "insensitive" } },
      { city: { contains: sp.q, mode: "insensitive" } },
    ];

  const PER = 50;
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  const [leads, total, matchCount] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PER,
      take: PER,
      include: { contacts: { take: 1 }, _count: { select: { contacts: true } } },
    }),
    prisma.lead.count(),
    prisma.lead.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(matchCount / PER));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (sp.q) u.set("q", sp.q);
    if (sp.stage) u.set("stage", sp.stage);
    u.set("page", String(p));
    return `/leads?${u.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description={`${total} ${total === 1 ? "business" : "businesses"} in your pipeline.`}
        actions={
          <Link href="/leads/import">
            <Button variant="outline">
              <Upload className="size-4" /> Import CSV
            </Button>
          </Link>
        }
      />

      <form className="flex flex-wrap items-center gap-2" action="/leads">
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Search business, domain, city…"
          className="h-9 w-64 rounded-md border border-border-strong bg-surface px-3 text-sm"
        />
        <select name="stage" defaultValue={sp.stage || ""} className="h-9 rounded-md border border-border-strong bg-surface px-3 text-sm">
          <option value="">All stages</option>
          {["NEW","RESEARCHING","QUALIFIED","READY_FOR_REVIEW","SCHEDULED","CONTACTED","REPLIED","INTERESTED","MEETING_BOOKED","WON","LOST","NOT_INTERESTED","SUPPRESSED"].map((s) => (
            <option key={s} value={s}>{stageLabel(s)}</option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm">Filter</Button>
      </form>

      {leads.length > 0 && <BulkBar matchCount={matchCount} stage={sp.stage} q={sp.q} />}

      {leads.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No leads yet"
          description="Import a CSV of businesses, or describe a discovery campaign in plain English and let the assistant find them."
          action={
            <div className="flex gap-2">
              <Link href="/leads/import"><Button variant="outline">Import CSV</Button></Link>
              <Link href="/campaigns/new"><Button>Describe a campaign</Button></Link>
            </div>
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <THead>
              <TR>
                <TH>Business</TH>
                <TH>Location</TH>
                <TH>Contacts</TH>
                <TH>Stage</TH>
                <TH>Updated</TH>
              </TR>
            </THead>
            <TBody>
              {leads.map((l) => (
                <TR key={l.id}>
                  <TD>
                    <Link href={`/leads/${l.id}`} className="font-medium hover:text-primary">
                      {l.businessName}
                    </Link>
                    {l.canonicalDomain && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-2">
                        <Globe className="size-3" /> {l.canonicalDomain}
                      </span>
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
            {page > 1 ? (
              <Link href={qs(page - 1)}><Button variant="outline" size="sm">Previous</Button></Link>
            ) : (
              <Button variant="outline" size="sm" disabled>Previous</Button>
            )}
            <span className="px-1 text-xs">Page {page} of {totalPages}</span>
            {page < totalPages ? (
              <Link href={qs(page + 1)}><Button variant="outline" size="sm">Next</Button></Link>
            ) : (
              <Button variant="outline" size="sm" disabled>Next</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
