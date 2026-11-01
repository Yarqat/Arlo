"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/interactive";
import { Alert, Stat } from "@/components/ui/misc";
import { Upload } from "lucide-react";

export function ImportClient({ campaigns }: { campaigns: { id: string; name: string }[] }) {
  const router = useRouter();
  const [csv, setCsv] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [requireEmail, setRequireEmail] = React.useState(true);
  const [campaignId, setCampaignId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [error, setError] = React.useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    setResult(null);
    setError("");
  }

  async function submit() {
    if (!csv) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/leads/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, requireEmail, campaignId: campaignId || undefined }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error + (data.headers ? ` (found columns: ${data.headers.join(", ")})` : ""));
      return;
    }
    setResult(data);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-10 text-center hover:bg-surface-2">
            <Upload className="size-6 text-muted-2" />
            <span className="text-sm font-medium">{fileName || "Choose a CSV file"}</span>
            <span className="text-xs text-muted-2">Columns auto-detected: business name, website, email, contact, phone, city, country, category…</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Add to campaign (optional)">
              <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">None</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={requireEmail} onCheckedChange={setRequireEmail} />
              <span className="text-sm">Exclude businesses with no public email from outreach</span>
            </div>
          </div>

          {error && <Alert tone="danger">{error}</Alert>}
          <Button onClick={submit} disabled={!csv || busy}>{busy ? "Importing…" : "Import leads"}</Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="pt-5">
            <Alert tone="success" title="Import complete" />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="New leads" value={result.summary.imported} />
              <Stat label="Merged" value={result.summary.merged} />
              <Stat label="Contacts added" value={result.summary.contactsAdded} />
              <Stat label="Duplicates" value={result.summary.duplicates} />
              <Stat label="No email" value={result.summary.noEmail} />
              <Stat label="Suppressed" value={result.summary.suppressedSkipped} />
            </div>
            <div className="mt-4">
              <Button variant="outline" onClick={() => router.push("/leads")}>View leads</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
