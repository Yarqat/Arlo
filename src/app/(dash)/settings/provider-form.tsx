"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Input, Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

async function post(body: unknown) {
  const res = await fetch("/api/provider-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function SimpleProviderForm({
  kind,
  providers,
  status,
  source,
  currentProvider,
  lastError,
}: {
  kind: "SEARCH" | "EMAIL_VERIFIER";
  providers: { value: string; label: string }[];
  status: string;
  source: string;
  currentProvider: string;
  lastError: string;
}) {
  const router = useRouter();
  const [provider, setProvider] = React.useState(currentProvider || providers[0]?.value || "");
  const [apiKey, setApiKey] = React.useState("");
  const [testing, setTesting] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    await post({ action: "save", kind, provider, apiKey: apiKey || undefined });
    setApiKey("");
    router.refresh();
  }
  async function test() {
    setTesting(true);
    setMsg(null);
    await post({ action: "save", kind, provider, apiKey: apiKey || undefined });
    setApiKey("");
    const r = await post({ action: "test", kind });
    setTesting(false);
    setMsg({ ok: !!r.ok, text: r.ok ? `Connected${r.sample != null ? ` — ${r.sample} sample results` : ""}.` : r.error || "Failed" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge tone={status === "CONNECTED" ? "success" : status === "ERROR" ? "danger" : "neutral"}>{status.toLowerCase()}</Badge>
        {source === "env" && <Badge tone="info">key from .env</Badge>}
        {source === "stored" && <Badge tone="neutral">key stored (encrypted)</Badge>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Provider">
          <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {providers.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="API key" hint="Stored encrypted, or set it in .env. Leave blank to keep current.">
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="•••" autoComplete="off" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={save}>Save</Button>
        <Button variant="outline" onClick={test} disabled={testing}>{testing ? "Testing…" : "Save & test"}</Button>
        {msg && <span className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>{msg.text}</span>}
        {!msg && lastError && <span className="text-sm text-danger">{lastError}</span>}
      </div>
    </div>
  );
}
