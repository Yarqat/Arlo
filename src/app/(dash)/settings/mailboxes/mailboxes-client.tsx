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
};

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
        <EmptyState icon={<Mails />} title="No mailboxes yet" description="Add one sending identity with its SMTP (send) and IMAP (receive) settings to start." action={<Button onClick={() => setEditing("new")}>Add mailbox</Button>} />
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
                    SMTP {mb.smtp?.host}:{mb.smtp?.port} · IMAP {mb.imap?.host}:{mb.imap?.port} · {mb.dailyLimit}/day, {mb.hourlyLimit}/hr
                  </p>
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

function MailboxDialog({ mb, onClose, onSaved }: { mb: MB | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = React.useState({
    senderName: mb?.senderName ?? "Shah Fahad",
    email: mb?.email ?? "",
    signature: mb?.signature ?? "",
    dailyLimit: mb?.dailyLimit ?? 50,
    hourlyLimit: mb?.hourlyLimit ?? 15,
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
  const [err, setErr] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });

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
      smtp: { host: f.smtpHost, port: f.smtpPort, secure: f.smtpSecure, user: f.smtpUser, pass: f.smtpPass || undefined },
      imap: { host: f.imapHost, port: f.imapPort, secure: f.imapSecure, user: f.imapUser, pass: f.imapPass || undefined },
    });
    setSaving(false);
    if (r.ok) onSaved();
    else setErr(r.error || "Save failed");
  }

  return (
    <Dialog
      open
      onClose={onClose}
      wide
      title={mb ? "Edit mailbox" : "Add mailbox"}
      description="SMTP sends; IMAP receives and threads replies."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sender name"><Input value={f.senderName} onChange={set("senderName")} /></Field>
          <Field label="Email address"><Input value={f.email} onChange={set("email")} placeholder="shah@yarqat.com" /></Field>
        </div>
        <Field label="Signature"><Textarea value={f.signature} onChange={set("signature")} rows={2} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Daily limit"><Input type="number" value={f.dailyLimit} onChange={set("dailyLimit")} /></Field>
          <Field label="Hourly limit"><Input type="number" value={f.hourlyLimit} onChange={set("hourlyLimit")} /></Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-semibold text-muted">SMTP (sending)</p>
            <Field label="Host"><Input value={f.smtpHost} onChange={set("smtpHost")} placeholder="smtp.example.com" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Port"><Input type="number" value={f.smtpPort} onChange={set("smtpPort")} /></Field>
              <Field label="TLS (SSL)"><div className="pt-2"><Switch checked={f.smtpSecure} onCheckedChange={(v) => setF({ ...f, smtpSecure: v })} /></div></Field>
            </div>
            <Field label="Username"><Input value={f.smtpUser} onChange={set("smtpUser")} /></Field>
            <Field label="Password" hint={mb ? "Leave blank to keep current" : undefined}><Input type="password" value={f.smtpPass} onChange={set("smtpPass")} autoComplete="off" /></Field>
          </div>
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-semibold text-muted">IMAP (receiving)</p>
            <Field label="Host"><Input value={f.imapHost} onChange={set("imapHost")} placeholder="imap.example.com" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Port"><Input type="number" value={f.imapPort} onChange={set("imapPort")} /></Field>
              <Field label="TLS (SSL)"><div className="pt-2"><Switch checked={f.imapSecure} onCheckedChange={(v) => setF({ ...f, imapSecure: v })} /></div></Field>
            </div>
            <Field label="Username"><Input value={f.imapUser} onChange={set("imapUser")} /></Field>
            <Field label="Password" hint={mb ? "Leave blank to keep current" : undefined}><Input type="password" value={f.imapPass} onChange={set("imapPass")} autoComplete="off" /></Field>
          </div>
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </Dialog>
  );
}
