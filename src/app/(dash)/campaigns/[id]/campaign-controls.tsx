"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";

async function post(body: unknown) {
  const res = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

export function CampaignControls({
  id, status, mode, sendingMailboxId, followUpSequenceId, mailboxes, sequences,
}: {
  id: string;
  status: string;
  mode: string;
  sendingMailboxId: string | null;
  followUpSequenceId: string | null;
  mailboxes: { id: string; senderName: string; email: string; status: string }[];
  sequences: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirmAuto, setConfirmAuto] = React.useState(false);

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
