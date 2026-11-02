import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Plus, ChevronRight } from "lucide-react";
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
        <div className="grid gap-3">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="block rounded-2xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-2">{c.businessType || "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={statusTone[c.status]}>{titleCase(c.status)}</Badge>
                  <ChevronRight className="size-4 text-muted-2" />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
                <span>Mode <span className="font-medium text-foreground">{modeLabel[c.outreachMode]}</span></span>
                <span>Leads <span className="font-medium text-foreground">{c._count.memberships.toLocaleString()}</span></span>
                <span>Messages <span className="font-medium text-foreground">{c._count.messages.toLocaleString()}</span></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
