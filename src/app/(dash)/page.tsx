import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { dayKey, monthKey, relativeTime } from "@/lib/time";
import { Stat, PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OnboardingChecklist } from "@/components/shell/onboarding";
import { PauseControl } from "@/components/shell/pause-control";
import { Activity, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

async function spend(scope: string, day: string) {
  const rows = await prisma.budgetCounter.findMany({ where: { scope, day } });
  const emailRow = rows.find((r) => r.kind === "EMAIL");
  const cost = rows.reduce((s, r) => s + Number(r.spentCost), 0);
  return { cost, emails: emailRow?.spentCount ?? 0 };
}

export default async function OverviewPage() {
  const settings = await getSettings();
  const tz = settings.timezone;
  const today = dayKey(tz);

  const [leadCount, contactedCount, interestedCount, repliedCount, meetings, todaySpend, monthRows, recent, aiConn, mailbox, campaigns] =
    await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { stage: { in: ["CONTACTED", "REPLIED", "INTERESTED", "MEETING_REQUESTED", "MEETING_BOOKED", "WON"] } } }),
      prisma.lead.count({ where: { stage: "INTERESTED" } }),
      prisma.lead.count({ where: { stage: "REPLIED" } }),
      prisma.lead.count({ where: { stage: "MEETING_BOOKED" } }),
      spend("GLOBAL", today),
      prisma.budgetCounter.findMany({ where: { scope: "GLOBAL", day: { startsWith: monthKey(tz) } } }),
      prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
      prisma.providerConnection.findFirst({ where: { kind: { in: ["AI_OPENAI", "AI_ANTHROPIC", "AI_CLAUDE_CODE"] }, status: "CONNECTED" } }),
      prisma.mailbox.findFirst({ where: { status: "CONNECTED" } }),
      prisma.campaign.count(),
    ]);

  const monthSpend = monthRows.reduce((s, r) => s + Number(r.spentCost), 0);
  const notReady = !aiConn || !mailbox;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Your outreach at a glance."
        actions={<PauseControl paused={settings.emergencyPause} />}
      />

      {notReady && <OnboardingChecklist hasAi={!!aiConn} hasMailbox={!!mailbox} hasCampaign={campaigns > 0} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Leads" value={leadCount} />
        <Stat label="Contacted" value={contactedCount} />
        <Stat label="Replied" value={repliedCount} />
        <Stat label="Interested" value={interestedCount} />
        <Stat label="Meetings" value={meetings} />
        <Stat label="Spend today" value={`$${todaySpend.cost.toFixed(2)}`} sub={`$${monthSpend.toFixed(2)} this month`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
            <Activity className="size-4 text-muted-2" />
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="As the assistant discovers, researches and contacts leads, every action with its evidence appears here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm">{e.summary || e.action}</p>
                      <p className="text-xs text-muted-2">
                        <Badge tone="neutral" className="mr-2">{e.actor}</Badge>
                        {e.entityType}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-2">{relativeTime(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickLink href="/assistant" label="Ask the assistant" />
            <QuickLink href="/campaigns/new" label="Describe a campaign" />
            <QuickLink href="/leads?import=1" label="Import a lead list" />
            <QuickLink href="/settings/connections" label="Connect AI & email" />
            <QuickLink href="/reports" label="View reports" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href}>
      <Button variant="outline" className="w-full justify-between">
        {label}
        <ArrowRight className="size-4" />
      </Button>
    </Link>
  );
}
