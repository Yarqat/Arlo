"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Switch } from "@/components/ui/interactive";

async function post(body: unknown) {
  const res = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

const TIMEZONES = [
  { v: "America/New_York", l: "US Eastern (New York)" },
  { v: "America/Chicago", l: "US Central (Chicago)" },
  { v: "America/Denver", l: "US Mountain (Denver)" },
  { v: "America/Los_Angeles", l: "US Pacific (Los Angeles)" },
  { v: "Europe/London", l: "UK (London)" },
  { v: "Australia/Sydney", l: "Australia (Sydney)" },
  { v: "America/Toronto", l: "Canada (Toronto)" },
  { v: "Asia/Karachi", l: "Pakistan (Karachi)" },
];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function hourLabel(h: number) {
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${ampm}`;
}

export function CampaignControls({
  id, status, mode, sendingMailboxId, followUpSequenceId, mailboxes, sequences, allowUnverified, autoDiscover, offer, timezone, businessHours,
}: {
  id: string;
  status: string;
  mode: string;
  sendingMailboxId: string | null;
  followUpSequenceId: string | null;
  mailboxes: { id: string; senderName: string; email: string; status: string }[];
  sequences: { id: string; name: string }[];
  allowUnverified: boolean;
  autoDiscover: boolean;
  offer: string;
  timezone: string;
  businessHours: { days?: number[]; start?: string; end?: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirmAuto, setConfirmAuto] = React.useState(false);
  const [offerText, setOfferText] = React.useState(offer);
  const [offerSaved, setOfferSaved] = React.useState(false);
  // Sending window
  const [winOn, setWinOn] = React.useState(!!businessHours);
  const [tz, setTz] = React.useState(timezone || "America/New_York");
  const [startH, setStartH] = React.useState(parseInt((businessHours?.start ?? "08:00").split(":")[0], 10));
  const [endH, setEndH] = React.useState(parseInt((businessHours?.end ?? "11:00").split(":")[0], 10));
  const [days, setDays] = React.useState<number[]>(businessHours?.days ?? [1, 2, 3, 4, 5]);
  const [winSaved, setWinSaved] = React.useState(false);

  async function control(body: Record<string, unknown>) {
    setBusy(true);
    await post({ action: "control", id, ...body });
    setBusy(false);
    router.refresh();
  }

  const connectedMailbox = mailboxes.find((m) => m.status === "CONNECTED");
  const canActivate = !!connectedMailbox && (!!sendingMailboxId || mailboxes.length > 0);

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          {status !== "ACTIVE" && (
            <Button onClick={() => control({ status: "ACTIVE" })} disabled={busy || !canActivate}>Activate</Button>
          )}
          {status === "ACTIVE" && (
            <Button variant="danger" onClick={() => control({ status: "PAUSED" })} disabled={busy}>Pause</Button>
          )}
          <Button variant="outline" onClick={async () => { setBusy(true); await post({ action: "discover", id }); setBusy(false); router.refresh(); }} disabled={busy}>
            Discover now
          </Button>
          {status !== "ARCHIVED" && (
            <Button variant="ghost" onClick={() => control({ status: "ARCHIVED" })} disabled={busy}>Archive</Button>
          )}
        </div>

        {!canActivate && (
          <Alert tone="warning">Connect a mailbox (Settings → Mailboxes) before activating a campaign that sends.</Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Outreach mode">
            <Select
              value={mode}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "AUTOMATIC" && mode !== "AUTOMATIC") { setConfirmAuto(true); return; }
                control({ outreachMode: v });
              }}
            >
              <option value="DRAFT_ONLY">Draft only</option>
              <option value="APPROVE_FIRST">Approve first email</option>
              <option value="AUTOMATIC">Automatic</option>
            </Select>
          </Field>
          <Field label="Sending mailbox">
            <Select value={sendingMailboxId ?? ""} onChange={(e) => control({ sendingMailboxId: e.target.value || null })}>
              <option value="">Default (first connected)</option>
              {mailboxes.map((m) => (
                <option key={m.id} value={m.id}>{m.senderName} — {m.email}{m.status !== "CONNECTED" ? " (not connected)" : ""}</option>
              ))}
            </Select>
          </Field>
          <Field label="Follow-up sequence">
            <Select value={followUpSequenceId ?? ""} onChange={(e) => control({ followUpSequenceId: e.target.value || null })}>
              <option value="">Default</option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="border-t border-border pt-4">
          <Field label="Your offer — what every email pitches">
            <Textarea
              value={offerText}
              onChange={(e) => { setOfferText(e.target.value); setOfferSaved(false); }}
              rows={2}
              placeholder="e.g. A faster, modern website with an online enquiry/quote form. Open by asking who currently looks after their website."
            />
          </Field>
          <div className="mt-2 flex items-center gap-3">
            <Button size="sm" variant="secondary" disabled={busy} onClick={async () => { await control({ offer: offerText }); setOfferSaved(true); }}>Save offer</Button>
            {offerSaved && <span className="text-xs text-success">Saved — new drafts will use this.</span>}
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Sending window</span>
            <Switch checked={winOn} onCheckedChange={(v) => { setWinOn(v); setWinSaved(false); }} />
          </div>
          <p className="text-xs text-muted">Only send during these hours in the chosen timezone — so emails land in the recipient&apos;s morning, not yours.</p>
          {winOn && (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Recipient timezone">
                  <Select value={tz} onChange={(e) => { setTz(e.target.value); setWinSaved(false); }}>
                    {TIMEZONES.map((z) => <option key={z.v} value={z.v}>{z.l}</option>)}
                  </Select>
                </Field>
                <Field label="From">
                  <Select value={String(startH)} onChange={(e) => { setStartH(Number(e.target.value)); setWinSaved(false); }}>
                    {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                  </Select>
                </Field>
                <Field label="To">
                  <Select value={String(endH)} onChange={(e) => { setEndH(Number(e.target.value)); setWinSaved(false); }}>
                    {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DAY_LABELS.map((d, i) => {
                  const dn = i + 1;
                  const on = days.includes(dn);
                  return (
                    <button key={dn} type="button"
                      onClick={() => { setDays((ds) => on ? ds.filter((x) => x !== dn) : [...ds, dn].sort()); setWinSaved(false); }}
                      className={on ? "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg" : "rounded-md border border-border-strong px-2.5 py-1 text-xs text-muted"}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" disabled={busy} onClick={async () => {
              await control({ timezone: tz, businessHours: winOn ? { days, start: `${String(startH).padStart(2, "0")}:00`, end: `${String(endH).padStart(2, "0")}:00` } : null });
              setWinSaved(true);
            }}>Save sending window</Button>
            {winSaved && <span className="text-xs text-success">Saved.</span>}
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <label className="flex items-start justify-between gap-4">
            <span className="text-sm">Keep finding new leads
              <span className="mt-0.5 block text-xs text-muted">Turn off to stop discovery but keep researching, verifying and drafting the leads you already have.</span>
            </span>
            <Switch checked={autoDiscover} onCheckedChange={(v) => control({ autoDiscover: v })} disabled={busy} />
          </label>
          <label className="flex items-start justify-between gap-4">
            <span className="text-sm">Allow unverified contacts
              <span className="mt-0.5 block text-xs text-muted">Draft and send even without a passing email verification. Use only if you have no verifier connected — unverified addresses can bounce.</span>
            </span>
            <Switch checked={allowUnverified} onCheckedChange={(v) => control({ allowUnverified: v })} disabled={busy} />
          </label>
        </div>

        {confirmAuto && (
          <Alert tone="warning" title="Enable automatic sending?">
            <p className="mb-2">In Automatic mode the system will discover, research, verify, draft and send eligible outreach within your configured limits — without asking each time.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { setConfirmAuto(false); control({ outreachMode: "AUTOMATIC" }); }}>Yes, enable automatic</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmAuto(false)}>Cancel</Button>
            </div>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
