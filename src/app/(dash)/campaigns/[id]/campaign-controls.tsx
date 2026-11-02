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

export function CampaignControls({
  id, status, mode, sendingMailboxId, followUpSequenceId, mailboxes, sequences, allowUnverified, autoDiscover, offer,
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
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirmAuto, setConfirmAuto] = React.useState(false);
  const [offerText, setOfferText] = React.useState(offer);
  const [offerSaved, setOfferSaved] = React.useState(false);

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
