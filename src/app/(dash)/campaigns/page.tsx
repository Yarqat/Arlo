import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Plus, ChevronRight, Target, Briefcase } from "lucide-react";
import { titleCase } from "@/lib/labels";
import { cn } from "@/lib/cn";

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
        <div className="grid gap-3 sm:grid-cols-2">
          {campaigns.map((c) => {
            const job = c.kind === "JOB_SEARCH";
            const KindIcon = job ? Briefcase : Target;
            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="group block rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", job ? "bg-info-soft text-info" : "bg-accent-soft text-primary")}>
                    <KindIcon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{c.name}</p>
                      <ChevronRight className="ml-auto size-4 shrink-0 text-muted-2 transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-2">{c.businessType || "—"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone={statusTone[c.status]}>{titleCase(c.status)}</Badge>
                      <Badge tone={job ? "info" : "neutral"}>{job ? "Job-search" : "Leads hunt"}</Badge>
                      <Badge tone="neutral">{modeLabel[c.outreachMode]}</Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs text-muted">
                  <span>Leads <span className="font-semibold text-foreground">{c._count.memberships.toLocaleString()}</span></span>
                  <span>Messages <span className="font-semibold text-foreground">{c._count.messages.toLocaleString()}</span></span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
