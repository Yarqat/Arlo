"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Plus, Trash2 } from "lucide-react";

type Contact = { id: string; email: string; emailType: string; name: string; role: string; verify: string };
const vTone = (s: string): "success" | "danger" | "warning" | "info" | "neutral" =>
  s === "DELIVERABLE" ? "success" : s === "INVALID" || s === "DISPOSABLE" ? "danger" : s === "CATCH_ALL" || s === "UNKNOWN" ? "warning" : s === "PENDING" ? "info" : "neutral";

export function ContactsEditor({ leadId, initial }: { leadId: string; initial: Contact[] }) {
  const router = useRouter();
  const [contacts, setContacts] = React.useState(initial);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  async function post(body: unknown) {
    const res = await fetch(`/api/leads/${leadId}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  async function add() {
    setErr("");
    if (!email.trim()) return;
    setBusy(true);
    const { ok, data } = await post({ type: "add_contact", email, name, role });
    setBusy(false);
    if (!ok) { setErr(data.error || "Failed to add"); return; }
    setEmail(""); setName(""); setRole(""); setAdding(false);
    router.refresh();
  }
  async function del(id: string) {
    setContacts((c) => c.filter((x) => x.id !== id));
    await post({ type: "delete_contact", contactId: id });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {contacts.length === 0 ? (
        <p className="text-sm text-muted">No contacts yet.</p>
      ) : (
        <ul className="space-y-3">
          {contacts.map((c) => (
            <li key={c.id} className="space-y-1 border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex items-center gap-2">
                <Mail className="size-3 text-muted-2" />
                <span className="break-all text-sm font-medium">{c.email}</span>
                <button onClick={() => del(c.id)} className="ml-auto text-muted-2 hover:text-danger" title="Remove contact"><Trash2 className="size-3.5" /></button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">{c.emailType.toLowerCase()}</Badge>
                <Badge tone={vTone(c.verify)}>{c.verify.toLowerCase().replace("_", "-")}</Badge>
                {c.name && <span className="text-xs text-muted">{c.name}{c.role ? ` · ${c.role}` : ""}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" type="email" autoComplete="off" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" />
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (optional)" />
          </div>
          {err && <p className="text-xs text-danger">{err}</p>}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={add} disabled={busy || !email.trim()}>{busy ? "Adding…" : "Add contact"}</Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setErr(""); }}>Cancel</Button>
          </div>
          <p className="text-xs text-muted-2">Added manually; verify it before sending — a valid syntax isn't proof of deliverability.</p>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="size-3.5" /> Add email / contact</Button>
      )}
    </div>
  );
}
