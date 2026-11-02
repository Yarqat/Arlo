import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { dayKey, monthKey, relativeTime } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { StatTile, Panel, WeeklyBars, Legend, CHART, Funnel, Donut } from "@/components/ui/dashboard";
import { OnboardingChecklist } from "@/components/shell/onboarding";
import { PauseControl } from "@/components/shell/pause-control";
import { Users, Send, MessagesSquare, Star, CalendarCheck, Wallet, Sparkles, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

const WON = ["WON"];
const INTERESTED = ["INTERESTED", "MEETING_REQUESTED", "MEETING_BOOKED"];

function trend(cur: number, prev: number): { dir: "up" | "down" | "flat"; text: string } | undefined {
  if (cur === 0 && prev === 0) return undefined;
  if (prev === 0) return { dir: "up", text: `+${cur}` };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat", text: `${pct > 0 ? "+" : ""}${pct}%` };
}

export default async function OverviewPage() {
  const settings = await getSettings();
  const tz = settings.timezone;
  const today = dayKey(tz);
  const now = Date.now();
  const d7 = new Date(now - 7 * 864e5), d14 = new Date(now - 14 * 864e5), d56 = new Date(now - 56 * 864e5);
  const sentStates = ["ACCEPTED", "SENT", "DELIVERED"] as const;

  const [
    leadCount, contacted, replied, interested, meetings, won, qualified, newLeads,
    sentCount, todayRows, monthRows, recent, aiConn, mailbox, campaigns,
    leadsNew7, leadsNewPrev7, replies7, repliesPrev7, outMsgs, inMsgs,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { stage: { in: ["CONTACTED", "REPLIED", "INTERESTED", "MEETING_REQUESTED", "MEETING_BOOKED", "WON"] } } }),
    prisma.lead.count({ where: { stage: "REPLIED" } }),
    prisma.lead.count({ where: { stage: { in: INTERESTED as any } } }),
    prisma.lead.count({ where: { stage: "MEETING_BOOKED" } }),
    prisma.lead.count({ where: { stage: { in: WON as any } } }),
    prisma.lead.count({ where: { stage: "QUALIFIED" } }),
    prisma.lead.count({ where: { stage: "NEW" } }),
    prisma.message.count({ where: { direction: "OUTBOUND", state: { in: [...sentStates] } } }),
    prisma.budgetCounter.findMany({ where: { scope: "GLOBAL", day: today } }),
    prisma.budgetCounter.findMany({ where: { scope: "GLOBAL", day: { startsWith: monthKey(tz) } } }),
    prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.providerConnection.findFirst({ where: { kind: { in: ["AI_OPENAI", "AI_ANTHROPIC", "AI_CLAUDE_CODE"] }, status: "CONNECTED" } }),
    prisma.mailbox.findFirst({ where: { status: "CONNECTED" } }),
    prisma.campaign.count(),
    prisma.lead.count({ where: { createdAt: { gte: d7 } } }),
    prisma.lead.count({ where: { createdAt: { gte: d14, lt: d7 } } }),
    prisma.message.count({ where: { direction: "INBOUND", createdAt: { gte: d7 } } }),
    prisma.message.count({ where: { direction: "INBOUND", createdAt: { gte: d14, lt: d7 } } }),
    prisma.message.findMany({ where: { direction: "OUTBOUND", state: { in: [...sentStates] }, sentAt: { gte: d56 } }, select: { sentAt: true } }),
    prisma.message.findMany({ where: { direction: "INBOUND", createdAt: { gte: d56 } }, select: { createdAt: true } }),
  ]);

  const todaySpend = todayRows.reduce((s, r) => s + Number(r.spentCost), 0);
  const monthSpend = monthRows.reduce((s, r) => s + Number(r.spentCost), 0);
  const notReady = !aiConn || !mailbox;

  // weekly buckets (8 weeks)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const wd = new Date(now - (7 - i) * 7 * 864e5);
    return { label: `${wd.getDate()}/${wd.getMonth() + 1}`, sent: 0, replies: 0 };
  });
  const bucket = (date: Date | null) => {
    if (!date) return -1;
    const idx = 7 - Math.floor((now - new Date(date).getTime()) / (7 * 864e5));
    return idx >= 0 && idx < 8 ? idx : -1;
  };
  for (const m of outMsgs) { const i = bucket(m.sentAt); if (i >= 0) weeks[i].sent++; }
  for (const m of inMsgs) { const i = bucket(m.createdAt); if (i >= 0) weeks[i].replies++; }

  const replyRate = sentCount > 0 ? Math.round((replied / sentCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Business overview</h1>
          <p className="mt-1 text-sm text-muted">A live look at your outreach pipeline.</p>
        </div>
        <div className="flex items-center gap-2">
          <PauseControl paused={settings.emergencyPause} />
          <Link href="/assistant" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-fg shadow-sm transition-colors hover:bg-primary-hover">
            <Sparkles className="size-4" /> Ask {settings.assistantName}
          </Link>
        </div>
      </div>

      {notReady && <OnboardingChecklist hasAi={!!aiConn} hasMailbox={!!mailbox} hasCampaign={campaigns > 0} />}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile tone="indigo" icon={<Users className="size-5" />} label="Total leads" value={leadCount.toLocaleString()} trend={trend(leadsNew7, leadsNewPrev7)} sub={`+${leadsNew7} this week`} />
        <StatTile tone="blue" icon={<Send className="size-5" />} label="Emails sent" value={sentCount.toLocaleString()} sub="confirmed accepted" />
        <StatTile tone="green" icon={<MessagesSquare className="size-5" />} label="Replies" value={replied.toLocaleString()} trend={trend(replies7, repliesPrev7)} sub={`${replyRate}% reply rate`} />
        <StatTile tone="amber" icon={<Star className="size-5" />} label="Interested" value={interested.toLocaleString()} />
        <StatTile tone="violet" icon={<CalendarCheck className="size-5" />} label="Meetings" value={meetings.toLocaleString()} />
        <StatTile tone="indigo" icon={<Wallet className="size-5" />} label="Spend today" value={`$${todaySpend.toFixed(2)}`} sub={`$${monthSpend.toFixed(2)} this month`} />
      </div>

      {/* Chart + donut */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Sends & replies" subtitle="Last 8 weeks" action={<Legend items={[{ label: "Sent", color: CHART.blue }, { label: "Replies", color: CHART.green }]} />}>
          <WeeklyBars data={weeks} />
        </Panel>
        <Panel title="Pipeline mix">
          <Donut
            centerLabel="leads"
            centerValue={leadCount.toLocaleString()}
            segments={[
              { label: "New", value: newLeads, color: "#93c5fd" },
              { label: "Working", value: qualified + contacted - replied - interested - won, color: "#3b82f6" },
              { label: "Replied", value: replied, color: "#2563eb" },
              { label: "Interested+", value: interested + won, color: CHART.green },
            ].filter((s) => s.value > 0)}
          />
        </Panel>
      </div>

      {/* Funnel + activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Pipeline" subtitle="Where your leads are now">
          <Funnel stages={[
            { label: "New", value: newLeads, color: "#93c5fd" },
            { label: "Qualified", value: qualified, color: "#60a5fa" },
            { label: "Contacted", value: contacted, color: "#3b82f6" },
            { label: "Replied", value: replied, color: "#2563eb" },
            { label: "Interested", value: interested, color: "#22c55e" },
            { label: "Won", value: won, color: "#15803d" },
          ]} />
        </Panel>

        <Panel className="lg:col-span-2" title="Recent activity">
          {recent.length === 0 ? (
            <EmptyState title="No activity yet" description="As Arlo discovers, researches and contacts leads, every action appears here with its evidence." />
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm">{e.summary || e.action}</p>
                    <p className="mt-0.5 text-xs text-muted-2"><Badge tone="neutral" className="mr-2">{e.actor}</Badge>{e.entityType}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-2">{relativeTime(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <QuickLink href="/campaigns/new" label="New campaign" />
            <QuickLink href="/leads/import" label="Add leads" />
            <QuickLink href="/reports" label="Reports" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
      {label} <ArrowRight className="size-3.5" />
    </Link>
  );
}
