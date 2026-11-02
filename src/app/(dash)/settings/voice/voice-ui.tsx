"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Input, Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/interactive";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({}));
}

// --- Assistant persona + behaviour ---
export function AssistantPrefs({ name, speak, briefing, briefingHour }: { name: string; speak: boolean; briefing: boolean; briefingHour: number }) {
  const router = useRouter();
  const [n, setN] = React.useState(name);
  const [sp, setSp] = React.useState(speak);
  const [br, setBr] = React.useState(briefing);
  const [hr, setHr] = React.useState(briefingHour);
  const [msg, setMsg] = React.useState("");

  async function save() {
    setMsg("");
    const r = await post("/api/settings/global", { assistantName: n, assistantSpeakByDefault: sp, dailyBriefingEnabled: br, dailyBriefingHour: hr });
    setMsg(r.ok ? "Saved" : r.error || "Error");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Assistant name"><Input value={n} onChange={(e) => setN(e.target.value)} placeholder="Arlo" /></Field>
        <Field label="Daily briefing hour (0–23, Asia/Karachi)"><Input type="number" min={0} max={23} value={hr} onChange={(e) => setHr(Number(e.target.value))} /></Field>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={sp} onCheckedChange={setSp} /> Speak responses aloud by default
      </label>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={br} onCheckedChange={setBr} /> Send a daily briefing each morning
      </label>
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={save}>Save</Button>
        {msg && <span className={msg === "Saved" ? "text-sm text-success" : "text-sm text-danger"}>{msg}</span>}
      </div>
    </div>
  );
}

// --- Speech provider (STT or TTS) ---
export function SpeechProviderForm({
  kind, providers, status, source, currentProvider, model, voice, lastError,
}: {
  kind: "SPEECH_STT" | "SPEECH_TTS";
  providers: { value: string; label: string }[];
  status: string;
  source: string;
  currentProvider: string;
  model: string;
  voice: string;
  lastError: string;
}) {
  const router = useRouter();
  const isTts = kind === "SPEECH_TTS";
  const [provider, setProvider] = React.useState(currentProvider || providers[0]?.value || "");
  const [apiKey, setApiKey] = React.useState("");
  const [mdl, setMdl] = React.useState(model);
  const [vce, setVce] = React.useState(voice);
  const [testing, setTesting] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    await post("/api/provider-config", { action: "save", kind, provider, apiKey: apiKey || undefined, model: mdl, ...(isTts ? { voice: vce } : {}) });
    setApiKey("");
    router.refresh();
  }
  async function test() {
    setTesting(true); setMsg(null);
    await post("/api/provider-config", { action: "save", kind, provider, apiKey: apiKey || undefined, model: mdl, ...(isTts ? { voice: vce } : {}) });
    setApiKey("");
    const r = await post("/api/provider-config", { action: "test", kind });
    setTesting(false);
    setMsg({ ok: !!r.ok, text: r.ok ? "Connected." : r.error || "Failed" });
    router.refresh();
  }

  const modelHint = isTts
    ? provider === "elevenlabs" ? "e.g. eleven_turbo_v2_5" : "e.g. tts-1 or gpt-4o-mini-tts"
    : provider === "deepgram" ? "e.g. nova-2" : "e.g. whisper-1 or gpt-4o-transcribe";

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
            {providers.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label="API key" hint="Stored encrypted, or set it in .env. Leave blank to keep current.">
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="•••" autoComplete="off" />
        </Field>
        <Field label="Model" hint={modelHint}><Input value={mdl} onChange={(e) => setMdl(e.target.value)} placeholder={modelHint.replace("e.g. ", "")} /></Field>
        {isTts && <Field label="Voice" hint={provider === "elevenlabs" ? "ElevenLabs voice id" : "e.g. alloy, verse, shimmer"}><Input value={vce} onChange={(e) => setVce(e.target.value)} /></Field>}
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

// --- Memory editor ---
type Mem = { id: string; scope: "PERSONAL" | "BUSINESS"; title: string; content: string };
export function MemoryEditor({ initial }: { initial: Mem[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  const [scope, setScope] = React.useState<"PERSONAL" | "BUSINESS">("PERSONAL");
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [err, setErr] = React.useState("");

  async function add() {
    setErr("");
    if (!title.trim() || !content.trim()) return;
    const r = await post("/api/assistant/memory", { action: "add", scope, title, content });
    if (r.error) { setErr(r.error); return; }
    setTitle(""); setContent("");
    router.refresh();
  }
  async function del(id: string) {
    await post("/api/assistant/memory", { action: "delete", id });
    setItems((x) => x.filter((m) => m.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Durable facts Arlo may use (preferences, how you work, business facts). Never store passwords or API keys — those belong in Connections.</p>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted">No saved memory yet.</p>}
        {items.map((m) => (
          <div key={m.id} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2">
            <Badge tone={m.scope === "BUSINESS" ? "info" : "neutral"}>{m.scope.toLowerCase()}</Badge>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{m.title}</p>
              <p className="text-xs text-muted">{m.content}</p>
            </div>
            <button onClick={() => del(m.id)} className="text-xs text-danger hover:underline">Delete</button>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <Field label="Scope">
          <Select value={scope} onChange={(e) => setScope(e.target.value as any)}>
            <option value="PERSONAL">Personal</option>
            <option value="BUSINESS">Business</option>
          </Select>
        </Field>
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Preferred tone" /></Field>
      </div>
      <Field label="Detail"><Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="e.g. Keep outreach short, concrete, no hype." /></Field>
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={add}>Add memory</Button>
        {err && <span className="text-sm text-danger">{err}</span>}
      </div>
    </div>
  );
}
