"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/interactive";
import { Plus } from "lucide-react";

type Model = { modelId: string; allowed: boolean; inputCostPerMTok: number | null; outputCostPerMTok: number | null };
type Conn = {
  id: string; kind: string; status: string; connectionType: string; lastError: string;
  lastTestedAt: string | null; source: string; discoveredModels: string[]; models: Model[];
};
type Allowed = { connectionId: string; kind: string; modelId: string };

const KIND_LABEL: Record<string, string> = {
  AI_OPENAI: "OpenAI",
  AI_ANTHROPIC: "Anthropic",
  AI_CLAUDE_CODE: "Claude Code CLI",
};

async function post(body: unknown) {
  const res = await fetch("/api/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function ConnectionsClient({
  connections,
  allowed,
  tasks,
  assignments,
}: {
  connections: Conn[];
  allowed: Allowed[];
  tasks: [string, string][];
  assignments: { task: string; connectionId: string; modelId: string }[];
}) {
  return (
    <div className="space-y-5">
      {connections.map((c) => (
        <ConnectionCard key={c.id} conn={c} />
      ))}
      <AssignmentsCard allowed={allowed} tasks={tasks} assignments={assignments} />
    </div>
  );
}

function statusTone(s: string): "success" | "danger" | "neutral" {
  return s === "CONNECTED" ? "success" : s === "ERROR" ? "danger" : "neutral";
}

function ConnectionCard({ conn }: { conn: Conn }) {
  const router = useRouter();
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [testing, setTesting] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [newModel, setNewModel] = React.useState("");
  const isCli = conn.kind === "AI_CLAUDE_CODE";

  async function save() {
    await post({ action: "save", id: conn.id, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined });
    setApiKey("");
    router.refresh();
  }
  async function test() {
    setTesting(true);
    setMsg(null);
    const r = await post({ action: "test", id: conn.id });
    setTesting(false);
    setMsg({ ok: !!r.ok, text: r.ok ? `Connected — ${r.models?.length ?? 0} models found.` : r.error || "Failed" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          {KIND_LABEL[conn.kind]}
          <Badge tone={statusTone(conn.status)}>{conn.status.toLowerCase()}</Badge>
          {conn.source === "env" && <Badge tone="info">key from .env</Badge>}
          {conn.source === "stored" && <Badge tone="neutral">key stored (encrypted)</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCli ? (
          <p className="text-sm text-muted">
            The Claude Code CLI adapter requires a legitimate authenticated installation running as a dedicated
            unprivileged user on the server (set <code>CLAUDE_CODE_BIN</code>, <code>CLAUDE_CODE_USER</code> and
            <code> CLAUDE_CODE_WORKDIR</code> in .env). Subscription limits are not API billing and are shown separately.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="API key" hint={conn.source === "env" ? "Currently sourced from .env. Entering a key here overrides nothing unless .env is empty." : "Stored encrypted. Leave blank to keep current."}>
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" />
            </Field>
            <Field label="Base URL (optional)" hint="For a compatible gateway or proxy.">
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="default" />
            </Field>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!isCli && <Button variant="secondary" onClick={save} disabled={!apiKey && !baseUrl}>Save key</Button>}
          <Button variant="outline" onClick={test} disabled={testing}>{testing ? "Testing…" : "Test connection"}</Button>
          {msg && <span className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>{msg.text}</span>}
          {!msg && conn.lastError && <span className="text-sm text-danger">{conn.lastError}</span>}
        </div>

        {!isCli && (conn.models.length > 0 || conn.discoveredModels.length > 0) && (
          <div className="rounded-md border border-border">
            <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted">
              Approved models & pricing (per 1M tokens)
            </div>
            <div className="divide-y divide-border">
              {conn.models.map((m) => (
                <ModelRow key={m.modelId} connectionId={conn.id} model={m} onChange={() => router.refresh()} />
              ))}
            </div>
            <div className="flex items-end gap-2 border-t border-border p-3">
              <div className="flex-1">
                <Field label="Add model id manually">
                  <Input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="e.g. gpt-4o-mini" />
                </Field>
              </div>
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!newModel.trim()) return;
                  await post({ action: "addModel", connectionId: conn.id, modelId: newModel.trim() });
                  setNewModel("");
                  router.refresh();
                }}
              >
                <Plus className="size-4" /> Add
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModelRow({ connectionId, model, onChange }: { connectionId: string; model: Model; onChange: () => void }) {
  const [inCost, setInCost] = React.useState(model.inputCostPerMTok?.toString() ?? "");
  const [outCost, setOutCost] = React.useState(model.outputCostPerMTok?.toString() ?? "");
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2">
      <Switch
        checked={model.allowed}
        onCheckedChange={async (v) => {
          await post({ action: "model", connectionId, modelId: model.modelId, allowed: v });
          onChange();
        }}
      />
      <span className="flex-1 font-mono text-xs">{model.modelId}</span>
      <input
        className="h-8 w-24 rounded border border-border-strong bg-surface px-2 text-xs"
        placeholder="in $/M"
        value={inCost}
        onChange={(e) => setInCost(e.target.value)}
      />
      <input
        className="h-8 w-24 rounded border border-border-strong bg-surface px-2 text-xs"
        placeholder="out $/M"
        value={outCost}
        onChange={(e) => setOutCost(e.target.value)}
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          await post({
            action: "model",
            connectionId,
            modelId: model.modelId,
            allowed: model.allowed,
            inputCostPerMTok: inCost === "" ? 0 : Number(inCost),
            outputCostPerMTok: outCost === "" ? 0 : Number(outCost),
          });
          onChange();
        }}
      >
        Save
      </Button>
    </div>
  );
}

function AssignmentsCard({
  allowed,
  tasks,
  assignments,
}: {
  allowed: Allowed[];
  tasks: [string, string][];
  assignments: { task: string; connectionId: string; modelId: string }[];
}) {
  const router = useRouter();
  const KIND_LABEL2: Record<string, string> = KIND_LABEL;
  function current(task: string) {
    const a = assignments.find((x) => x.task === task);
    return a ? `${a.connectionId}::${a.modelId}` : "";
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Model per task</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.map(([task, label]) => (
          <div key={task} className="flex items-center justify-between gap-3">
            <span className="text-sm">{label}</span>
            <Select
              className="max-w-xs"
              defaultValue={current(task)}
              onChange={async (e) => {
                const v = e.target.value;
                if (!v) {
                  await post({ action: "unassign", task });
                } else {
                  const [connectionId, modelId] = v.split("::");
                  await post({ action: "assign", task, connectionId, modelId });
                }
                router.refresh();
              }}
            >
              <option value="">Not assigned</option>
              {allowed.map((a) => (
                <option key={a.connectionId + a.modelId} value={`${a.connectionId}::${a.modelId}`}>
                  {KIND_LABEL2[a.kind]} · {a.modelId}
                </option>
              ))}
            </Select>
          </div>
        ))}
        {allowed.length === 0 && <p className="text-sm text-muted">Approve at least one model above to assign tasks.</p>}
      </CardContent>
    </Card>
  );
}
