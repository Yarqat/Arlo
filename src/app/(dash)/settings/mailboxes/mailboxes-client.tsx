"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Field, Textarea } from "@/components/ui/input";
import { Switch, Dialog } from "@/components/ui/interactive";
import { EmptyState } from "@/components/ui/misc";
import { fmtDateTime } from "@/lib/time";
import { Mails, Plus, Pencil } from "lucide-react";

type Cfg = { host: string; port: number; secure: boolean; user: string } | null;
type MB = {
  id: string; senderName: string; email: string; signature: string; providerType: string;
  dailyLimit: number; hourlyLimit: number; status: string; lastError: string;
  lastSyncAt: string | null; lastTestedAt: string | null; smtp: Cfg; imap: Cfg;
  replyTo?: string; senderIdentities?: { email: string; name: string }[] | null;
};

// Parse a "Name <email>" per-line textarea into identity objects.
function parseIdentities(text: string): { email: string; name: string }[] {
  return text.split("\n").map((raw) => {
    const s = raw.trim();
    if (!s) return null;
    const m = s.match(/^(.*?)\s*<\s*([^<>\s]+@[^<>\s]+\.[^<>\s]+)\s*>$/);
    if (m) return { email: m[2].toLowerCase(), name: m[1].trim() };
    if (/^[^<>\s]+@[^<>\s]+\.[^<>\s]+$/.test(s)) return { email: s.toLowerCase(), name: "" };
    return null;
  }).filter((x): x is { email: string; name: string } => !!x);
}

async function post(body: unknown) {
  const res = await fetch("/api/mailboxes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

export function MailboxesClient({ mailboxes }: { mailboxes: MB[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<MB | "new" | null>(null);
  const [testMsg, setTestMsg] = React.useState<Record<string, string>>({});

  async function test(id: string) {
    setTestMsg((m) => ({ ...m, [id]: "Testing…" }));
    const r = await post({ action: "test", id });
    setTestMsg((m) => ({
      ...m,
      [id]: r.ok ? "Connected (SMTP + IMAP ok)" : `SMTP: ${r.smtp?.ok ? "ok" : r.smtp?.error}; IMAP: ${r.imap?.ok ? "ok" : r.imap?.error}`,
    }));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add mailbox</Button>
      </div>

      {mailboxes.length === 0 ? (
        <EmptyState icon={<Mails />} title="No mailboxes yet" description="Add a sending identity. Pick Gmail or Microsoft to auto-fill the servers — add IMAP so Arlo can read replies, or save it send-only." action={<Button onClick={() => setEditing("new")}>Add mailbox</Button>} />
      ) : (
        mailboxes.map((mb) => (
          <Card key={mb.id}>
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{mb.senderName}</p>
                    <Badge tone={mb.status === "CONNECTED" ? "success" : mb.status === "ERROR" ? "danger" : "neutral"}>{mb.status.toLowerCase()}</Badge>
                  </div>
                  <p className="text-sm text-muted">{mb.email}</p>
                  <p className="mt-1 text-xs text-muted-2">
                    SMTP {mb.smtp?.host}:{mb.smtp?.port} · {mb.imap ? `IMAP ${mb.imap.host}:${mb.imap.port}` : "send-only (no reply monitoring)"} · {mb.dailyLimit}/day, {mb.hourlyLimit}/hr
                  </p>
                  {!mb.imap && <Badge tone="neutral">send-only</Badge>}
                  <p className="text-xs text-muted-2">Last sync: {fmtDateTime(mb.lastSyncAt)} · Last test: {fmtDateTime(mb.lastTestedAt)}</p>
                  {mb.lastError && <p className="mt-1 text-xs text-danger">{mb.lastError}</p>}
                  {testMsg[mb.id] && <p className="mt-1 text-xs text-info">{testMsg[mb.id]}</p>}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => test(mb.id)}>Test</Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(mb)}><Pencil className="size-3" /> Edit</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {editing && (
        <MailboxDialog
          mb={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// One-click presets so users don't have to hunt for host/port values. Gmail and
// Microsoft need an "app password" (normal password won't work with 2FA on).
const PRESETS: Record<string, { label: string; smtpHost: string; smtpPort: number; smtpSecure: boolean; imapHost: string; imapPort: number; imapSecure: boolean; note?: string }> = {
  gmail: {
    label: "Gmail / Google Workspace",
    smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true,
    imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true,
    note: "Turn on 2-step verification, then create an App Password (Google Account → Security → App passwords) and paste it as the password below — your normal Gmail password won't work. Also enable IMAP in Gmail → Settings → Forwarding and POP/IMAP.",
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false,
    imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true,
    note: "If 2FA is on, create an App Password in your Microsoft account security settings and use it below.",
  },
};

function MailboxDialog({ mb, onClose, onSaved }: { mb: MB | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = React.useState({
    senderName: mb?.senderName ?? "Shah Fahad",
    email: mb?.email ?? "",
    signature: mb?.signature ?? "",
    dailyLimit: mb?.dailyLimit ?? 50,
    hourlyLimit: mb?.hourlyLimit ?? 15,
    replyTo: mb?.replyTo ?? "",
    sendAs: (mb?.senderIdentities ?? []).map((i) => (i.name ? `${i.name} <${i.email}>` : i.email)).join("\n"),
    smtpHost: mb?.smtp?.host ?? "",
    smtpPort: mb?.smtp?.port ?? 587,
    smtpSecure: mb?.smtp?.secure ?? false,
    smtpUser: mb?.smtp?.user ?? "",
    smtpPass: "",
    imapHost: mb?.imap?.host ?? "",
    imapPort: mb?.imap?.port ?? 993,
    imapSecure: mb?.imap?.secure ?? true,
    imapUser: mb?.imap?.user ?? "",
    imapPass: "",
  });
  // New mailboxes default to monitoring replies; an existing send-only mailbox
  // (no IMAP stored) stays send-only until the user turns it back on.
  const [monitor, setMonitor] = React.useState<boolean>(mb ? !!mb.imap : true);
  const [preset, setPreset] = React.useState<string>("");
  const [err, setErr] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });

  function applyPreset(key: string) {
    setPreset(key);
    const p = PRESETS[key];
    if (!p) return;
    setF((cur) => ({
      ...cur,
      smtpHost: p.smtpHost, smtpPort: p.smtpPort, smtpSecure: p.smtpSecure,
      imapHost: p.imapHost, imapPort: p.imapPort, imapSecure: p.imapSecure,
      // Default the usernames to the email address — the usual case for Gmail/Microsoft.
      smtpUser: cur.smtpUser || cur.email,
      imapUser: cur.imapUser || cur.email,
    }));
  }

  async function save() {
    setErr("");
    setSaving(true);
    const r = await post({
      action: "save",
      id: mb?.id,
      senderName: f.senderName,
      email: f.email,
      signature: f.signature,
      providerType: "smtp",
      dailyLimit: f.dailyLimit,
      hourlyLimit: f.hourlyLimit,
      replyTo: f.replyTo,
      senderIdentities: parseIdentities(f.sendAs),
      smtp: { host: f.smtpHost, port: f.smtpPort, secure: f.smtpSecure, user: f.smtpUser, pass: f.smtpPass || undefined },
      // null = explicitly send-only; the API clears any stored IMAP config.
      imap: monitor ? { host: f.imapHost, port: f.imapPort, secure: f.imapSecure, user: f.imapUser, pass: f.imapPass || undefined } : null,
    });
    setSaving(false);
    if (r.ok) onSaved();
    else setErr(r.error || "Save failed");
  }

  const presetNote = preset ? PRESETS[preset]?.note : undefined;

  return (
    <Dialog
      open
      onClose={onClose}
      wide
      title={mb ? "Edit mailbox" : "Add mailbox"}
      description="SMTP sends email. Add IMAP so Arlo can read and thread replies."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Email provider" hint="Pick one to auto-fill the server settings, or choose Other to enter them manually.">
          <div className="flex flex-wrap gap-2">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={`rounded-full border px-3 py-1 text-xs ${preset === key ? "border-primary bg-primary/10 text-foreground" : "border-border-strong text-muted hover:bg-surface-2"}`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPreset("other")}
              className={`rounded-full border px-3 py-1 text-xs ${preset === "other" ? "border-primary bg-primary/10 text-foreground" : "border-border-strong text-muted hover:bg-surface-2"}`}
            >
              Other (manual)
            </button>
          </div>
        </Field>
        {presetNote && <p className="rounded-md border border-border bg-surface-2 p-2 text-xs text-muted">{presetNote}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sender name"><Input value={f.senderName} onChange={set("senderName")} /></Field>
          <Field label="Email address"><Input value={f.email} onChange={set("email")} placeholder="shah@yarqat.com" /></Field>
        </div>
        <Field label="Signature"><Textarea value={f.signature} onChange={set("signature")} rows={2} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Daily limit"><Input type="number" value={f.dailyLimit} onChange={set("dailyLimit")} /></Field>
          <Field label="Hourly limit"><Input type="number" value={f.hourlyLimit} onChange={set("hourlyLimit")} /></Field>
        </div>

        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs font-semibold text-muted">Sending identities (optional)</p>
          <Field
            label="Send-as addresses"
            hint="One per line, e.g. Shah Fahad &lt;shah@yarqat.com&gt;. The From rotates across these (same verified domain, e.g. AWS SES) plus the address above, stable per lead. Leave blank to always send as the address above."
          >
            <Textarea value={f.sendAs} onChange={set("sendAs")} rows={3} placeholder={"Shah Fahad <shah@yarqat.com>\nHello Yarqat <hello@yarqat.com>"} />
          </Field>
          <Field
            label="Reply-to address"
            hint="All replies go here regardless of which From was used. Set this to your one monitored inbox (the IMAP mailbox below). Leave blank to use the address above."
          >
            <Input value={f.replyTo} onChange={set("replyTo")} placeholder="support@yarqat.com" />
          </Field>
        </div>

        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs font-semibold text-muted">SMTP (sending)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Host"><Input value={f.smtpHost} onChange={set("smtpHost")} placeholder="smtp.example.com" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Port"><Input type="number" value={f.smtpPort} onChange={set("smtpPort")} /></Field>
              <Field label="TLS (SSL)"><div className="pt-2"><Switch checked={f.smtpSecure} onCheckedChange={(v) => setF({ ...f, smtpSecure: v })} /></div></Field>
            </div>
            <Field label="Username"><Input value={f.smtpUser} onChange={set("smtpUser")} placeholder="usually your email address" /></Field>
            <Field label="Password" hint={mb ? "Leave blank to keep current" : "App password for Gmail/Microsoft"}><Input type="password" value={f.smtpPass} onChange={set("smtpPass")} autoComplete="off" /></Field>
          </div>
        </div>

        <div className="rounded-md border border-border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch checked={monitor} onCheckedChange={setMonitor} />
            Monitor replies on this mailbox (IMAP)
          </label>
          {monitor ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Field label="IMAP host"><Input value={f.imapHost} onChange={set("imapHost")} placeholder="imap.example.com" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Port"><Input type="number" value={f.imapPort} onChange={set("imapPort")} /></Field>
                <Field label="TLS (SSL)"><div className="pt-2"><Switch checked={f.imapSecure} onCheckedChange={(v) => setF({ ...f, imapSecure: v })} /></div></Field>
              </div>
              <Field label="Username"><Input value={f.imapUser} onChange={set("imapUser")} placeholder="usually your email address" /></Field>
              <Field label="Password" hint={mb ? "Leave blank to keep current" : "App password for Gmail/Microsoft"}><Input type="password" value={f.imapPass} onChange={set("imapPass")} autoComplete="off" /></Field>
            </div>
          ) : (
            <p className="mt-2 rounded-md border border-warning/40 bg-warning-soft p-2 text-xs text-warning">
              ⚠️ Send-only mailbox. Arlo will send emails but <b>can&apos;t monitor replies</b> — it won&apos;t detect responses,
              auto-pause follow-ups when someone replies, or show the conversation in the Inbox. Turn this on and add IMAP if your
              provider supports it.
            </p>
          )}
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </Dialog>
  );
}
