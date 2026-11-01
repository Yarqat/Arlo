"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/interactive";
import { Trash2, Plus } from "lucide-react";

type Service = { id: string; name: string; description: string; enabled: boolean };
type Item = { id: string; title: string; url: string; description: string };

async function post(url: string, body: unknown) {
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function ServicesManager({ services }: { services: Service[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");

  async function add() {
    if (!name.trim()) return;
    await post("/api/services", { action: "upsert", name, description: desc });
    setName("");
    setDesc("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="divide-y divide-border">
        {services.map((s) => (
          <ServiceRow key={s.id} service={s} onChange={() => router.refresh()} />
        ))}
      </div>
      <div className="rounded-md border border-dashed border-border-strong p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <Field label="New service"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website redesign" /></Field>
          <Field label="Description"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Approved, factual description" /></Field>
          <Button type="button" onClick={add}><Plus className="size-4" /> Add</Button>
        </div>
      </div>
    </div>
  );
}

function ServiceRow({ service, onChange }: { service: Service; onChange: () => void }) {
  const [desc, setDesc] = React.useState(service.description);
  const [dirty, setDirty] = React.useState(false);
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="pt-1">
        <Switch
          checked={service.enabled}
          onCheckedChange={async (v) => {
            await post("/api/services", { action: "upsert", id: service.id, enabled: v });
            onChange();
          }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{service.name}</p>
        <Textarea
          value={desc}
          onChange={(e) => {
            setDesc(e.target.value);
            setDirty(true);
          }}
          rows={2}
          className="mt-1 text-xs"
        />
        {dirty && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-1"
            onClick={async () => {
              await post("/api/services", { action: "upsert", id: service.id, description: desc });
              setDirty(false);
              onChange();
            }}
          >
            Save description
          </Button>
        )}
      </div>
      <button
        className="pt-1 text-muted hover:text-danger"
        onClick={async () => {
          await post("/api/services", { action: "delete", id: service.id });
          onChange();
        }}
        aria-label="Delete"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

export function PortfolioManager({ items }: { items: Item[] }) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <div className="divide-y divide-border">
          {items.map((it) => (
            <div key={it.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{it.title}</p>
                {it.url && <a href={it.url} className="text-xs text-primary hover:underline" target="_blank" rel="noreferrer">{it.url}</a>}
                {it.description && <p className="text-xs text-muted">{it.description}</p>}
              </div>
              <button
                className="text-muted hover:text-danger"
                onClick={async () => {
                  await post("/api/portfolio", { action: "delete", id: it.id });
                  router.refresh();
                }}
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-md border border-dashed border-border-strong p-3 space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="URL"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></Field>
        </div>
        <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Button
          type="button"
          onClick={async () => {
            if (!title.trim()) return;
            await post("/api/portfolio", { action: "create", title, url, description });
            setTitle(""); setUrl(""); setDescription("");
            router.refresh();
          }}
        >
          <Plus className="size-4" /> Add example
        </Button>
      </div>
    </div>
  );
}
