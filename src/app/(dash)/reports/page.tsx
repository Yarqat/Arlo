import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { monthKey, relativeTime } from "@/lib/time";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Funnel, Donut, BarList, Meter } from "@/components/ui/charts";

export const dynamic = "force-dynamic";

function rate(num: number, den: number) {
  if (den === 0) return "—";
  return `${((num / den) * 100).toFixed(1)}%`;
}

export default async function ReportsPage() {
  const settings = await getSettings();
  const tz = settings.timezone;
  const month = monthKey(tz);

  const [
    leadsDiscovered,
    duplicatesRejected,
    qualified,
    withEmail,
    verified,
    excludedByVerify,
    drafts,
    scheduled,
    accepted,
    delivered,
    hardBounces,
    tempFailures,
    replies,
    interested,
    unsubscribes,
    meetings,
    won,
    ledger,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.auditEvent.count({ where: { action: "dedupe_rejected" } }),
    prisma.lead.count({ where: { qualification: "QUALIFIED" } }),
    prisma.contact.count(),
    prisma.contact.count({ where: { verifications: { some: { status: "DELIVERABLE" } } } }),
    prisma.lead.count({ where: { qualification: "EXCLUDED_NO_EMAIL" } }),
    prisma.message.count({ where: { direction: "OUTBOUND", state: "DRAFT" } }),
    prisma.message.count({ where: { direction: "OUTBOUND", state: { in: ["QUEUED", "SENDING"] } } }),
    prisma.message.count({ where: { direction: "OUTBOUND", state: { in: ["ACCEPTED", "SENT", "DELIVERED"] } } }),
    prisma.message.count({ where: { direction: "OUTBOUND", state: "DELIVERED" } }),
    prisma.message.count({ where: { state: "BOUNCED" } }),
    prisma.auditEvent.count({ where: { action: "temp_failure" } }),
    prisma.message.count({ where: { direction: "INBOUND", isAutoReply: false } }),
    prisma.lead.count({ where: { stage: "INTERESTED" } }),
    prisma.suppressionRecord.count({ where: { reason: "UNSUBSCRIBE" } }),
    prisma.lead.count({ where: { stage: "MEETING_BOOKED" } }),
    prisma.lead.count({ where: { stage: "WON" } }),
    prisma.usageLedger.groupBy({
      by: ["kind"],
      where: { day: { startsWith: month } },
      _sum: { cost: true, count: true, requests: true, tokensIn: true, tokensOut: true },
    }),
  ]);

  const byKind = (k: string) => ledger.find((l) => l.kind === k);
  const aiSpend = Number(byKind("AI")?._sum.cost ?? 0);
  const verifySpend = Number(byKind("VERIFICATION")?._sum.cost ?? 0);
  const emailSpend = Number(byKind("EMAIL")?._sum.cost ?? 0);

  // --- Deliverability health, A/B variants, reply-by-industry, buying signals ---
  const REPLIED_STAGES = ["REPLIED", "INTERESTED", "MEETING_REQUESTED", "MEETING_BOOKED", "WON"] as const;
  const CONTACTED_STAGES = ["CONTACTED", "NOT_INTERESTED", ...REPLIED_STAGES] as const;
  const [clickAgg, clickedMessages, recentClicks, suppressionByReason, variantMsgs, contactedLeads, signalCount, recentSignals] = await Promise.all([
    prisma.message.aggregate({ where: { direction: "OUTBOUND" }, _sum: { clickCount: true } }),
    prisma.message.count({ where: { direction: "OUTBOUND", clickCount: { gt: 0 } } }),
    prisma.messageEvent.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, url: true, createdAt: true, message: { select: { lead: { select: { id: true, businessName: true } } } } } }),
    prisma.suppressionRecord.groupBy({ by: ["reason"], _count: true }),
    prisma.message.findMany({
      where: { direction: "OUTBOUND", followUpStep: 0, variantKey: { not: "" } },
      select: { variantKey: true, campaign: { select: { name: true } }, lead: { select: { stage: true } } },
    }),
    prisma.lead.findMany({ where: { stage: { in: CONTACTED_STAGES as any } }, select: { category: true, stage: true } }),
    prisma.lead.count({ where: { contentChangedAt: { not: null } } }),
    prisma.lead.findMany({ where: { contentChangedAt: { not: null } }, orderBy: { contentChangedAt: "desc" }, take: 8, select: { id: true, businessName: true, contentChangedAt: true, stage: true } }),
  ]);

  const bounceRate = accepted > 0 ? (hardBounces / accepted) * 100 : 0;
  const bounceHealthy = bounceRate < 3;
  const totalClicks = clickAgg._sum.clickCount ?? 0;

  // A/B: sent + replied per variant (reply = the lead reached a replied-ish stage).
  const variantAgg = new Map<string, { campaign: string; sent: number; replied: number }>();
  for (const m of variantMsgs) {
    const k = `${m.campaign?.name ?? "—"} · ${m.variantKey}`;
    const row = variantAgg.get(k) ?? { campaign: m.campaign?.name ?? "—", sent: 0, replied: 0 };
    row.sent++;
    if (m.lead && (REPLIED_STAGES as readonly string[]).includes(m.lead.stage)) row.replied++;
    variantAgg.set(k, row);
  }
  const variantRows = [...variantAgg.entries()].map(([k, v]) => ({ key: k, ...v }));

  // Reply rate by industry/category.
  const catAgg = new Map<string, { contacted: number; replied: number }>();
  for (const l of contactedLeads) {
    const c = (l.category || "Uncategorised").trim() || "Uncategorised";
    const row = catAgg.get(c) ?? { contacted: 0, replied: 0 };
    row.contacted++;
    if ((REPLIED_STAGES as readonly string[]).includes(l.stage)) row.replied++;
    catAgg.set(c, row);
  }
  const catRows = [...catAgg.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.contacted - a.contacted)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description={`Definitions are explicit. Spend figures cover ${month} (${tz}).`} />

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Leads discovered" value={leadsDiscovered} />
        <Stat label="Replies (human)" value={replies} />
        <Stat label="Interested" value={interested} />
        <Stat label="Meetings booked" value={meetings} />
        <Stat label="Link clicks" value={totalClicks} sub={`${clickedMessages} clicked`} />
        <Stat label="Reply rate" value={rate(replies, accepted)} />
      </div>

      {/* Pipeline funnel + spend / health */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline funnel</CardTitle>
            <CardDescription>How many leads make it through each stage. The % is conversion from the stage above.</CardDescription>
          </CardHeader>
          <CardContent>
            <Funnel
              steps={[
                { label: "Discovered", value: leadsDiscovered },
                { label: "Qualified", value: qualified },
                { label: "Has contact", value: withEmail },
                { label: "Verified", value: verified },
                { label: "Accepted", value: accepted, hint: "Accepted by the mail provider — not inbox delivery" },
                { label: "Delivered", value: delivered, hint: "Confirmed via provider events only" },
                { label: "Replied", value: replies },
                { label: "Interested", value: interested },
                { label: "Meetings", value: meetings },
              ]}
            />
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <Card>
            <CardHeader><CardTitle>Spend this month</CardTitle></CardHeader>
            <CardContent>
              <Donut
                centerLabel={`$${(aiSpend + verifySpend + emailSpend).toFixed(2)} total`}
                data={[
                  { label: "AI", value: aiSpend },
                  { label: "Verification", value: verifySpend },
                  { label: "Email", value: emailSpend },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Hard-bounce rate</CardTitle></CardHeader>
            <CardContent>
              <Meter value={bounceRate} threshold={3} />
              <p className="mt-3 text-xs text-muted">
                {bounceHealthy ? "Healthy — under the 3% line that gets senders suspended." : "⚠ Above 3% — turn on verification and slow sending to protect your domain."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rates — with numerator, denominator and basis</CardTitle>
          <CardDescription>
            SMTP acceptance is not inbox delivery. Open rates are intentionally omitted (no tracking pixels).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR><TH>Rate</TH><TH>Value</TH><TH>Numerator</TH><TH>Denominator</TH></TR>
            </THead>
            <TBody>
              <TR><TD>Qualification rate</TD><TD className="tabular-nums">{rate(qualified, leadsDiscovered)}</TD><TD>Qualified leads ({qualified})</TD><TD>All leads ({leadsDiscovered})</TD></TR>
              <TR><TD>Reply rate</TD><TD className="tabular-nums">{rate(replies, accepted)}</TD><TD>Human replies ({replies})</TD><TD>Messages accepted ({accepted})</TD></TR>
              <TR><TD>Click rate</TD><TD className="tabular-nums">{rate(clickedMessages, accepted)}</TD><TD>Emails with a click ({clickedMessages})</TD><TD>Messages accepted ({accepted})</TD></TR>
              <TR><TD>Interested rate</TD><TD className="tabular-nums">{rate(interested, replies)}</TD><TD>Interested ({interested})</TD><TD>Replies ({replies})</TD></TR>
              <TR><TD>Hard bounce rate</TD><TD className="tabular-nums">{rate(hardBounces, accepted)}</TD><TD>Hard bounces ({hardBounces})</TD><TD>Messages accepted ({accepted})</TD></TR>
              <TR><TD>Meeting rate</TD><TD className="tabular-nums">{rate(meetings, replies)}</TD><TD>Meetings ({meetings})</TD><TD>Replies ({replies})</TD></TR>
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deliverability health</CardTitle>
          <CardDescription>
            Sender reputation guardrails. Mailbox providers suspend senders whose hard-bounce rate climbs
            too high — keep it under ~3%. Verify emails before sending to keep bounces down.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`rounded-lg border p-3 text-sm ${bounceHealthy ? "border-border bg-surface-2" : "border-danger bg-danger-soft text-danger"}`}>
            {bounceHealthy
              ? `Hard-bounce rate is ${bounceRate.toFixed(1)}% — healthy.`
              : `⚠ Hard-bounce rate is ${bounceRate.toFixed(1)}% — above the safe 3% threshold. Turn on email verification and slow sending to protect your domain.`}
          </div>
          <Table>
            <THead>
              <TR><TH>Suppression reason</TH><TH>Addresses</TH></TR>
            </THead>
            <TBody>
              {suppressionByReason.length === 0 ? (
                <TR><TD>None yet</TD><TD>0</TD></TR>
              ) : suppressionByReason.map((s) => (
                <TR key={s.reason}><TD>{s.reason.replace(/_/g, " ").toLowerCase()}</TD><TD className="tabular-nums">{s._count}</TD></TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>A/B subject lines</CardTitle>
          <CardDescription>
            Reply rate per subject variant. Set variants on a campaign to start testing — drafts rotate through
            them automatically. Reply here means the lead reached a replied/interested/meeting stage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {variantRows.length === 0 ? (
            <p className="text-sm text-muted">No A/B data yet. Add subject variants to a campaign to begin testing.</p>
          ) : (
            <Table>
              <THead>
                <TR><TH>Campaign · variant</TH><TH>Sent</TH><TH>Replied</TH><TH>Reply rate</TH></TR>
              </THead>
              <TBody>
                {variantRows.map((v) => (
                  <TR key={v.key}><TD>{v.key}</TD><TD className="tabular-nums">{v.sent}</TD><TD className="tabular-nums">{v.replied}</TD><TD className="tabular-nums">{rate(v.replied, v.sent)}</TD></TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reply rate by industry</CardTitle>
          <CardDescription>Which categories respond best — focus discovery where replies come from.</CardDescription>
        </CardHeader>
        <CardContent>
          {catRows.length === 0 ? (
            <p className="text-sm text-muted">No contacted leads yet.</p>
          ) : (
            <div className="space-y-5">
              <BarList rows={catRows.map((c) => ({ label: c.category, value: c.contacted, sub: `${rate(c.replied, c.contacted)} reply` }))} />
              <Table>
                <THead>
                  <TR><TH>Category</TH><TH>Contacted</TH><TH>Replied</TH><TH>Reply rate</TH></TR>
                </THead>
                <TBody>
                  {catRows.map((c) => (
                    <TR key={c.category}><TD>{c.category}</TD><TD className="tabular-nums">{c.contacted}</TD><TD className="tabular-nums">{c.replied}</TD><TD className="tabular-nums">{rate(c.replied, c.contacted)}</TD></TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent link clicks</CardTitle>
          <CardDescription>
            Who clicked a link in your emails, and where to. Click tracking only — no open tracking.
            Enable it in Settings → Automation & scheduling.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentClicks.length === 0 ? (
            <p className="text-sm text-muted">No clicks recorded yet. Clicks appear here once tracking is on and your emails contain links.</p>
          ) : (
            <Table>
              <THead>
                <TR><TH>Lead</TH><TH>Clicked</TH><TH>Destination</TH></TR>
              </THead>
              <TBody>
                {recentClicks.map((c) => (
                  <TR key={c.id}>
                    <TD>{c.message?.lead ? <Link href={`/leads/${c.message.lead.id}`} className="text-primary hover:underline">{c.message.lead.businessName}</Link> : "—"}</TD>
                    <TD>{relativeTime(c.createdAt)}</TD>
                    <TD className="max-w-xs truncate text-muted">{c.url || "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buying signals — websites that changed</CardTitle>
          <CardDescription>
            {signalCount} lead{signalCount === 1 ? "" : "s"} changed their website since Arlo last checked — a timely,
            specific reason to reach out again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentSignals.length === 0 ? (
            <p className="text-sm text-muted">No change signals yet. Detected automatically on each re-research.</p>
          ) : (
            <Table>
              <THead>
                <TR><TH>Business</TH><TH>Stage</TH><TH>Changed</TH></TR>
              </THead>
              <TBody>
                {recentSignals.map((l) => (
                  <TR key={l.id}>
                    <TD><Link href={`/leads/${l.id}`} className="text-primary hover:underline">{l.businessName}</Link></TD>
                    <TD>{l.stage.replace(/_/g, " ").toLowerCase()}</TD>
                    <TD>{l.contentChangedAt ? relativeTime(l.contentChangedAt) : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-2">Won projects recorded manually: {won}.</p>
    </div>
  );
}
