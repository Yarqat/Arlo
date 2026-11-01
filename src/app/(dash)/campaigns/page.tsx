import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Megaphone, Plus } from "lucide-react";
import { titleCase } from "@/lib/labels";

export const dynamic = "force-dynamic";

const statusTone: Record<string, "neutral" | "success" | "warning" | "info"> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  PAUSED: "warning",
  ARCHIVED: "neutral",
};
const modeLabel: Record<string, string> = {
  DRAFT_ONLY: "Draft only",
  APPROVE_FIRST: "Approve first email",
  AUTOMATIC: "Automatic",
};

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { memberships: true, messages: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Each campaign is a search brief plus sending rules."
        actions={
          <Link href="/campaigns/new">
            <Button><Plus className="size-4" /> New campaign</Button>
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title="No campaigns yet"
          description="Describe the leads you want in plain English — the assistant turns it into an editable brief, then discovers, researches and drafts outreach within your rules."
          action={<Link href="/campaigns/new"><Button>Create your first campaign</Button></Link>}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <THead>
              <TR>
                <TH>Campaign</TH>
                <TH>Status</TH>
                <TH>Mode</TH>
                <TH>Leads</TH>
                <TH>Messages</TH>
              </TR>
            </THead>
            <TBody>
              {campaigns.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/campaigns/${c.id}`} className="font-medium hover:text-primary">{c.name}</Link>
                    <p className="text-xs text-muted-2">{c.businessType || "—"}</p>
                  </TD>
                  <TD><Badge tone={statusTone[c.status]}>{titleCase(c.status)}</Badge></TD>
                  <TD className="text-muted">{modeLabel[c.outreachMode]}</TD>
                  <TD className="text-muted">{c._count.memberships}</TD>
                  <TD className="text-muted">{c._count.messages}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
