import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { stageLabel, stageTone, verifyLabel, verifyTone, titleCase } from "@/lib/labels";
import { fmtDateTime, relativeTime } from "@/lib/time";
import { LeadActions } from "./lead-actions";
import { Globe, MapPin, Phone, ArrowLeft, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      contacts: { include: { verifications: { orderBy: { checkedAt: "desc" }, take: 1 } } },
      findings: { orderBy: { researchedAt: "desc" } },
      source: true,
      primaryCampaign: true,
      stageHistory: { orderBy: { createdAt: "desc" }, take: 10 },
      scheduledActions: { orderBy: { createdAt: "desc" }, take: 10 },
      messages: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!lead) notFound();

  const facts = lead.findings.filter((f) => f.kind === "FACT");
  const opportunities = lead.findings.filter((f) => f.kind === "OPPORTUNITY");

  return (
    <div className="space-y-6">
      <Link href="/leads" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
        <ArrowLeft className="size-3" /> Leads
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{lead.businessName}</h1>
            <Badge tone={stageTone(lead.stage)}>{stageLabel(lead.stage)}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary"><Globe className="size-3" />{lead.canonicalDomain || lead.website}</a>}
            {(lead.city || lead.country) && <span className="flex items-center gap-1"><MapPin className="size-3" />{[lead.city, lead.region, lead.country].filter(Boolean).join(", ")}</span>}
            {lead.phone && <span className="flex items-center gap-1"><Phone className="size-3" />{lead.phone}</span>}
          </div>
        </div>
        <LeadActions leadId={lead.id} stage={lead.stage} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {lead.qualification === "EXCLUDED_NO_EMAIL" && (
            <Card><CardContent className="pt-5"><Badge tone="danger">Excluded</Badge> <span className="text-sm text-muted">{lead.exclusionReason}</span></CardContent></Card>
          )}

          <Card>
            <CardHeader><CardTitle>Why this lead matches</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted">{lead.matchExplanation || "No qualification explanation yet. Run research to evaluate fit against the campaign brief."}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Research findings</CardTitle>
              <CardDescription>Observed facts and suggested opportunities are kept separate. Each carries its evidence.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {lead.findings.length === 0 ? (
                <p className="text-sm text-muted">No findings yet.</p>
              ) : (
                <>
                  {facts.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase text-muted">Observed facts</p>
                      <div className="space-y-2">{facts.map((f) => <Finding key={f.id} f={f} />)}</div>
                    </div>
                  )}
                  {opportunities.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase text-muted">Opportunities</p>
                      <div className="space-y-2">{opportunities.map((f) => <Finding key={f.id} f={f} />)}</div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Messages</CardTitle></CardHeader>
            <CardContent>
              {lead.messages.length === 0 ? (
                <p className="text-sm text-muted">No messages yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {lead.messages.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Badge tone={m.direction === "OUTBOUND" ? "primary" : "info"}>{m.direction.toLowerCase()}</Badge>
                        {m.subject || "(no subject)"}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-2">
                        <Badge tone="neutral">{titleCase(m.state)}</Badge>
                        {relativeTime(m.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Contacts</CardTitle></CardHeader>
            <CardContent>
              {lead.contacts.length === 0 ? (
                <p className="text-sm text-muted">No contacts.</p>
              ) : (
                <ul className="space-y-3">
                  {lead.contacts.map((c) => {
                    const v = c.verifications[0];
                    return (
                      <li key={c.id} className="space-y-1 border-b border-border pb-3 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2">
                          <Mail className="size-3 text-muted-2" />
                          <span className="break-all text-sm font-medium">{c.email}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">{c.emailType.toLowerCase()}</Badge>
                          <Badge tone={verifyTone(v?.status ?? "UNVERIFIED")}>{verifyLabel(v?.status ?? "UNVERIFIED")}</Badge>
                          {c.name && <span className="text-xs text-muted">{c.name}{c.role ? ` · ${c.role}` : ""}</span>}
                        </div>
                        {v && <p className="text-xs text-muted-2">Verified {relativeTime(v.checkedAt)} by {v.provider}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Provenance</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="Source" value={lead.source?.name ?? "—"} />
              <Row label="Method" value={lead.discoveryMethod || "—"} />
              <Row label="Discovered" value={fmtDateTime(lead.discoveredAt)} />
              <Row label="Researched" value={fmtDateTime(lead.researchedAt)} />
              <Row label="Campaign" value={lead.primaryCampaign ? lead.primaryCampaign.name : "—"} />
              {lead.discoverySourceUrl && <Row label="Source URL" value={<a className="text-primary hover:underline" href={lead.discoverySourceUrl} target="_blank" rel="noreferrer">link</a>} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Stage history</CardTitle></CardHeader>
            <CardContent>
              {lead.stageHistory.length === 0 ? (
                <p className="text-sm text-muted">No changes yet.</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {lead.stageHistory.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-2">
                      <span>{h.fromStage ? `${stageLabel(h.fromStage)} → ` : ""}<b>{stageLabel(h.toStage)}</b> <span className="text-muted-2">({h.actor})</span></span>
                      <span className="text-muted-2">{relativeTime(h.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Finding({ f }: { f: { observation: string; pageUrl: string; evidenceText: string; measurement: string; needsManualReview: boolean } }) {
  return (
    <div className="rounded-md border border-border bg-surface-2/40 p-3">
      <p className="text-sm">{f.observation}</p>
      {f.evidenceText && <p className="mt-1 text-xs text-muted">Evidence: “{f.evidenceText}”</p>}
      {f.measurement && <p className="mt-0.5 text-xs text-muted">Measurement: {f.measurement}</p>}
      <div className="mt-1 flex items-center gap-2">
        {f.pageUrl && <a href={f.pageUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{f.pageUrl}</a>}
        {f.needsManualReview && <Badge tone="warning">needs review</Badge>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
