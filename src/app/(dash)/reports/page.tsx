import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { monthKey } from "@/lib/time";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

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

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description={`Definitions are explicit. Spend figures cover ${month} (${tz}).`} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Leads discovered" value={leadsDiscovered} sub="unique businesses imported" />
        <Stat label="Duplicates rejected" value={duplicatesRejected} />
        <Stat label="Qualified" value={qualified} />
        <Stat label="Contacts (public email)" value={withEmail} />
        <Stat label="Verified deliverable" value={verified} />
        <Stat label="Excluded — no email" value={excludedByVerify} />
        <Stat label="Drafts created" value={drafts} />
        <Stat label="Scheduled to send" value={scheduled} />
        <Stat label="Accepted by provider" value={accepted} sub="SMTP 250 / API id — not inbox delivery" />
        <Stat label="Confirmed delivered" value={delivered} sub="only via provider events" />
        <Stat label="Hard bounces" value={hardBounces} />
        <Stat label="Temp failures" value={tempFailures} />
        <Stat label="Replies (human)" value={replies} />
        <Stat label="Interested" value={interested} />
        <Stat label="Unsubscribes" value={unsubscribes} />
        <Stat label="Meetings booked" value={meetings} />
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
              <TR><TD>Interested rate</TD><TD className="tabular-nums">{rate(interested, replies)}</TD><TD>Interested ({interested})</TD><TD>Replies ({replies})</TD></TR>
              <TR><TD>Hard bounce rate</TD><TD className="tabular-nums">{rate(hardBounces, accepted)}</TD><TD>Hard bounces ({hardBounces})</TD><TD>Messages accepted ({accepted})</TD></TR>
              <TR><TD>Meeting rate</TD><TD className="tabular-nums">{rate(meetings, replies)}</TD><TD>Meetings ({meetings})</TD><TD>Replies ({replies})</TD></TR>
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="AI spend (month)" value={`$${aiSpend.toFixed(2)}`} sub={`${byKind("AI")?._sum.requests ?? 0} requests`} />
        <Stat label="Verification spend" value={`$${verifySpend.toFixed(2)}`} sub={`${byKind("VERIFICATION")?._sum.count ?? 0} checks`} />
        <Stat label="Email send spend" value={`$${emailSpend.toFixed(2)}`} sub={`${byKind("EMAIL")?._sum.count ?? 0} sends`} />
      </div>

      <p className="text-xs text-muted-2">Won projects recorded manually: {won}.</p>
    </div>
  );
}
