import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/misc";
import { stageLabel, stageTone, titleCase } from "@/lib/labels";
import { CampaignControls } from "./campaign-controls";
import { DraftsReview } from "./drafts-review";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CampaignDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) notFound();

  const [mailboxes, sequences, memberCount, drafts, stageGroups, sent, replies] = await Promise.all([
    prisma.mailbox.findMany({ select: { id: true, senderName: true, email: true, status: true } }),
    prisma.followUpSequence.findMany({ select: { id: true, name: true } }),
    prisma.campaignMembership.count({ where: { campaignId: id } }),
    prisma.message.findMany({
      where: { campaignId: id, direction: "OUTBOUND", state: "DRAFT" },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { lead: { select: { businessName: true } }, contact: { select: { email: true } } },
    }),
    prisma.lead.groupBy({ by: ["stage"], where: { primaryCampaignId: id }, _count: true }),
    prisma.message.count({ where: { campaignId: id, direction: "OUTBOUND", state: { in: ["ACCEPTED", "SENT", "DELIVERED"] } } }),
    prisma.message.count({ where: { campaignId: id, direction: "INBOUND", isAutoReply: false } }),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/campaigns" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
        <ArrowLeft className="size-3" /> Campaigns
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{campaign.name}</h1>
            <Badge tone={campaign.status === "ACTIVE" ? "success" : campaign.status === "PAUSED" ? "warning" : "neutral"}>{titleCase(campaign.status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">{campaign.businessType || "No business type set"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Leads" value={memberCount} />
        <Stat label="Messages sent" value={sent} />
        <Stat label="Replies" value={replies} />
        <Stat label="Drafts to review" value={drafts.length} />
      </div>

      <CampaignControls
        id={campaign.id}
        status={campaign.status}
        mode={campaign.outreachMode}
        sendingMailboxId={campaign.sendingMailboxId}
        followUpSequenceId={campaign.followUpSequenceId}
        mailboxes={mailboxes}
        sequences={sequences}
        allowUnverified={campaign.allowUnverified}
        autoDiscover={campaign.autoDiscover}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Brief</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Countries" value={campaign.countries.join(", ") || "—"} />
            <Row label="Cities" value={campaign.cities.join(", ") || "—"} />
            <Row label="Language" value={campaign.language} />
            <Row label="Services" value={campaign.servicesOffered.join(", ") || "—"} />
            <Row label="Max new/day" value={String(campaign.maxNewLeadsPerDay ?? "—")} />
            <Row label="Catch-all allowed" value={campaign.allowCatchAll ? "Yes" : "No"} />
            <Row label="Unknown allowed" value={campaign.allowUnknown ? "Yes" : "No"} />
            {campaign.positiveCriteria && <p className="pt-2 text-xs text-muted">Positive: {campaign.positiveCriteria}</p>}
            {campaign.exclusions && <p className="text-xs text-muted">Exclusions: {campaign.exclusions}</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Pipeline</CardTitle></CardHeader>
          <CardContent>
            {stageGroups.length === 0 ? (
              <p className="text-sm text-muted">No leads yet. Use “Discover now” or import a list.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stageGroups.map((g) => (
                  <Badge key={g.stage} tone={stageTone(g.stage)}>{stageLabel(g.stage)}: {g._count}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Drafts awaiting review</CardTitle>
          <CardDescription>Review, edit, then send. In Draft-only and Approve-first modes nothing sends until you approve it.</CardDescription>
        </CardHeader>
        <CardContent>
          <DraftsReview drafts={drafts.map((d) => ({ id: d.id, subject: d.subject, bodyText: d.bodyText, to: d.contact?.email ?? d.toAddrs[0] ?? "", business: d.lead?.businessName ?? "" }))} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
