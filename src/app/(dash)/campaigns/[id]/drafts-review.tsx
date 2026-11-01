"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { FileText } from "lucide-react";

type Draft = { id: string; subject: string; bodyText: string; to: string; business: string };

async function post(body: unknown) {
  const res = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

export function DraftsReview({ drafts }: { drafts: Draft[] }) {
  const router = useRouter();
  if (drafts.length === 0) {
    return <EmptyState icon={<FileText />} title="No drafts to review" description="Drafts created for this campaign will appear here for your approval." />;
  }
  return (
    <div className="space-y-4">
      {drafts.map((d) => (
        <DraftRow key={d.id} draft={d} onChange={() => router.refresh()} />
      ))}
    </div>
  );
}

function DraftRow({ draft, onChange }: { draft: Draft; onChange: () => void }) {
  const [subject, setSubject] = React.useState(draft.subject);
  const [body, setBody] = React.useState(draft.bodyText);
  const [busy, setBusy] = React.useState("");
  const dirty = subject !== draft.subject || body !== draft.bodyText;

  async function act(action: string) {
    setBusy(action);
    if (action === "send" && dirty) await post({ action: "edit", id: draft.id, subject, bodyText: body });
    await post({ action, id: draft.id, ...(action === "edit" ? { subject, bodyText: body } : {}) });
    setBusy("");
    onChange();
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span>To <b className="text-foreground">{draft.to}</b>{draft.business ? ` · ${draft.business}` : ""}</span>
      </div>
      <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mb-2 font-medium" />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="font-mono text-xs" />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => act("send")} disabled={!!busy}>{busy === "send" ? "Sending…" : "Approve & send"}</Button>
        {dirty && <Button size="sm" variant="secondary" onClick={() => act("edit")} disabled={!!busy}>Save edits</Button>}
        <Button size="sm" variant="ghost" onClick={() => act("discard")} disabled={!!busy}>Discard</Button>
      </div>
    </div>
  );
}
