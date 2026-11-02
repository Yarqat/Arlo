"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Input, Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function ManualLead({ campaigns }: { campaigns: { id: string; name: string }[] }) {
  const router = useRouter();
  const [f, setF] = React.useState({ businessName: "", website: "", email: "", contactName: "", role: "", city: "", country: "", campaignId: "" });
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit() {
    if (!f.businessName.trim()) return;
    setBusy(true); setMsg(null);
    const res = await fetch("/api/leads/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, campaignId: f.campaignId || undefined }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: data.error || "Failed" }); return; }
    const s = data.summary || {};
    setMsg({ ok: true, text: s.imported ? "Lead added." : s.merged || s.contactsAdded ? "Merged into an existing lead." : s.duplicates ? "Already in your list." : "Saved." });
    setF({ businessName: "", website: "", email: "", contactName: "", role: "", city: "", country: "", campaignId: f.campaignId });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a lead manually</CardTitle>
        <CardDescription>Enter one business by hand. It's de-duplicated by domain and city, just like an import.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name *"><Input value={f.businessName} onChange={set("businessName")} placeholder="Acme Hood Cleaning" /></Field>
          <Field label="Website"><Input value={f.website} onChange={set("website")} placeholder="acmehood.com" /></Field>
          <Field label="Email"><Input value={f.email} onChange={set("email")} placeholder="owner@acmehood.com" type="email" autoComplete="off" /></Field>
          <Field label="Contact name"><Input value={f.contactName} onChange={set("contactName")} placeholder="Optional" /></Field>
          <Field label="City"><Input value={f.city} onChange={set("city")} placeholder="Optional" /></Field>
          <Field label="Country"><Input value={f.country} onChange={set("country")} placeholder="Optional" /></Field>
        </div>
        {campaigns.length > 0 && (
          <Field label="Add to campaign (optional)">
            <Select value={f.campaignId} onChange={set("campaignId")}>
              <option value="">— none —</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={busy || !f.businessName.trim()}>{busy ? "Saving…" : "Add lead"}</Button>
          {msg && <span className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>{msg.text}</span>}
        </div>
        <p className="text-xs text-muted-2">A manually entered email isn't verified — run Verify before any outreach.</p>
      </CardContent>
    </Card>
  );
}
