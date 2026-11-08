import { prisma } from "@/lib/db";
import { SettingsBack } from "../settings-ui";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getOverview, getDmarcSummary, type Health } from "@/lib/deliverability/metrics";
import { DomainAuth, DmarcSync } from "./deliverability-client";
import { Mail, ShieldCheck, TriangleAlert, UserMinus, Network, Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

// Tone a rate by health thresholds.
function rateTone(value: number, goodBelow: number, warnBelow: number): "success" | "warning" | "danger" {
  if (value < goodBelow) return "success";
  if (value < warnBelow) return "warning";
  return "danger";
}
const TONE_TEXT = { success: "text-success", warning: "text-warning", danger: "text-danger" } as const;

const HEALTH_BADGE: Record<Health, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  healthy: { tone: "success", label: "Healthy" },
  watch: { tone: "warning", label: "Watch" },
  at_risk: { tone: "danger", label: "At risk" },
  idle: { tone: "neutral", label: "Too few sent" },
};

export default async function DeliverabilityPage() {
  const [ov, dmarc] = await Promise.all([getOverview(30), getDmarcSummary(30)]);

  // Sending-domain list for the auth checker comes straight from the overview.
  const domains = ov.domains;

  const deliveryTone = rateTone(1 - ov.deliveryRate, 0.02, 0.05); // based on non-delivery
  const bounceTone = rateTone(ov.bounceRate, 0.02, 0.05);

  const topCards = [
    { label: `Emails sent · last ${ov.windowDays}d`, value: ov.sent.toLocaleString(), sub: ov.sent === 0 ? "No sends yet in this window" : undefined, icon: Mail, tint: "text-primary", soft: "bg-accent-soft" },
    { label: "Delivery rate", value: ov.sent ? pct(ov.deliveryRate) : "—", sub: "Accepted and not bounced", icon: ShieldCheck, tint: TONE_TEXT[deliveryTone], soft: "bg-surface-2" },
    { label: "Bounce rate", value: ov.sent ? pct(ov.bounceRate) : "—", sub: "Keep under 2%", icon: TriangleAlert, tint: TONE_TEXT[bounceTone], soft: "bg-surface-2" },
    { label: "Opt-outs & complaints", value: (ov.unsubscribes + ov.complaints).toLocaleString(), sub: `${ov.unsubscribes} unsub · ${ov.complaints} complaints`, icon: UserMinus, tint: "text-muted", soft: "bg-surface-2" },
  ];

  return (
    <div className="space-y-8">
      <SettingsBack title="Deliverability" description="Keep your emails landing in the inbox — check your domain setup and watch your sending health." />

      {/* Inbox health — Phase 0 */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Inbox health</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {topCards.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.label} className="p-5">
                <div className="flex items-start justify-between">
                  <p className="text-xs font-medium text-muted">{c.label}</p>
                  <span className={`flex size-8 items-center justify-center rounded-xl ${c.soft}`}>
                    <Icon className={`size-4 ${c.tint}`} />
                  </span>
                </div>
                <p className={`mt-3 text-[26px] font-semibold leading-none tracking-tight tabular-nums ${c.tint}`}>{c.value}</p>
                {c.sub && <p className="mt-1.5 text-xs text-muted-2">{c.sub}</p>}
              </Card>
            );
          })}
        </div>

        {/* Per-mailbox health */}
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <p className="text-sm font-semibold">Mailbox health</p>
            <p className="text-xs text-muted">Each sending inbox over the last {ov.windowDays} days.</p>
          </div>
          {ov.mailboxes.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">No mailboxes configured yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Mailbox</TH>
                  <TH className="text-right">Sent</TH>
                  <TH className="text-right">Delivery</TH>
                  <TH className="text-right">Bounce</TH>
                  <TH className="text-right">Status</TH>
                </TR>
              </THead>
              <TBody>
                {ov.mailboxes.map((m) => {
                  const hb = HEALTH_BADGE[m.health];
                  return (
                    <TR key={m.id}>
                      <TD>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-muted">{m.email}</p>
                      </TD>
                      <TD className="text-right tabular-nums">{m.sent.toLocaleString()}</TD>
                      <TD className="text-right tabular-nums">{m.sent ? pct(m.deliveryRate) : "—"}</TD>
                      <TD className={`text-right tabular-nums ${m.sent && m.bounceRate >= 0.05 ? "text-danger" : m.sent && m.bounceRate >= 0.02 ? "text-warning" : ""}`}>
                        {m.sent ? pct(m.bounceRate) : "—"}
                      </TD>
                      <TD className="text-right"><Badge tone={hb.tone}>{hb.label}</Badge></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </section>

      {/* Domain setup — Phase 1 */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Domain setup</h2>
        <p className="-mt-1 text-sm text-muted">
          SPF, DKIM and DMARC tell inbox providers your mail is really from you. Fix any red or amber item below to protect your reputation.
        </p>
        <DomainAuth domains={domains} />
      </section>

      {/* DMARC reports — Phase 2 */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Who's sending as you · DMARC</h2>
            <p className="mt-1 text-sm text-muted">
              DMARC reports reveal every server sending mail with your domain — yours and any spoofers.
            </p>
          </div>
          <DmarcSync lastReportAt={dmarc.lastReportAt} />
        </div>

        {!dmarc.hasData ? (
          <Card className="flex flex-col items-center gap-3 border-dashed border-border-strong px-6 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-surface-2 text-muted"><Inbox className="size-5" /></span>
            <div className="space-y-1">
              <p className="text-sm font-medium">No DMARC reports yet</p>
              <p className="mx-auto max-w-md text-sm text-muted">
                Add a <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">rua</code> address to your DMARC record pointing at one of your mailboxes, then press <span className="font-medium text-foreground">Sync reports now</span>. Mailbox providers email these aggregate reports daily.
              </p>
            </div>
            <code className="rounded-lg bg-surface-2 px-3 py-1.5 font-mono text-xs text-muted">
              v=DMARC1; p=reject; rua=mailto:dmarc@{domains[0]?.domain ?? "yourdomain.com"}
            </code>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-5">
                <p className="text-xs font-medium text-muted">DMARC alignment</p>
                <p className={`mt-3 text-[26px] font-semibold leading-none tabular-nums ${dmarc.alignmentRate >= 0.98 ? "text-success" : dmarc.alignmentRate >= 0.9 ? "text-warning" : "text-danger"}`}>
                  {pct(dmarc.alignmentRate)}
                </p>
                <p className="mt-1.5 text-xs text-muted-2">of mail passed DMARC</p>
              </Card>
              <Card className="p-5">
                <p className="text-xs font-medium text-muted">Messages reported</p>
                <p className="mt-3 text-[26px] font-semibold leading-none tabular-nums">{dmarc.totalMessages.toLocaleString()}</p>
                <p className="mt-1.5 text-xs text-muted-2">across {dmarc.reportCount} report{dmarc.reportCount === 1 ? "" : "s"}</p>
              </Card>
              <Card className="p-5">
                <p className="text-xs font-medium text-muted">Sending sources</p>
                <p className="mt-3 text-[26px] font-semibold leading-none tabular-nums">{dmarc.sources.length}</p>
                <p className="mt-1.5 text-xs text-muted-2">distinct IPs seen</p>
              </Card>
              <Card className="p-5">
                <p className="text-xs font-medium text-muted">Reporting providers</p>
                <p className="mt-3 text-[26px] font-semibold leading-none tabular-nums">{dmarc.orgs.length}</p>
                <p className="mt-1.5 truncate text-xs text-muted-2">{dmarc.orgs.slice(0, 3).join(", ") || "—"}</p>
              </Card>
            </div>

            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                <Network className="size-4 text-muted-2" />
                <p className="text-sm font-semibold">Top sending sources</p>
              </div>
              <Table>
                <THead>
                  <TR>
                    <TH>Source</TH>
                    <TH className="text-right">Messages</TH>
                    <TH className="text-right">Aligned</TH>
                    <TH className="text-right">Verdict</TH>
                  </TR>
                </THead>
                <TBody>
                  {dmarc.sources.map((s) => {
                    const ok = s.rate >= 0.98;
                    const warn = s.rate >= 0.5;
                    return (
                      <TR key={s.ip}>
                        <TD>
                          <p className="font-medium">{s.host || s.ip}</p>
                          {s.host && <p className="font-mono text-xs text-muted">{s.ip}</p>}
                        </TD>
                        <TD className="text-right tabular-nums">{s.messages.toLocaleString()}</TD>
                        <TD className="text-right tabular-nums">{pct(s.rate)}</TD>
                        <TD className="text-right">
                          <Badge tone={ok ? "success" : warn ? "warning" : "danger"}>
                            {ok ? "Passing" : warn ? "Partial" : "Failing"}
                          </Badge>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
            <p className="text-xs text-muted-2">
              A source failing DMARC is either a legitimate service you haven't authorised (add it to SPF/DKIM) or someone spoofing your domain.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
