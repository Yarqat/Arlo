"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { FileText } from "lucide-react";

type Draft = { id: string; subject: string; bodyText: string; to: string; business: string };

type PostResult = { ok: boolean; status: number; error?: string; stale?: boolean };

async function post(body: unknown): Promise<PostResult> {
  let res: Response;
  try {
    res = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    // Network failure — almost always an offline blip or a page left open across a redeploy.
    return { ok: false, status: 0, error: "Couldn't reach the server. Reload the page and try again.", stale: true };
  }
  let data: { error?: string } = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.ok) return { ok: true, status: res.status };
  // A page loaded before the last deploy can send stale requests — reload fixes it.
  const stale = res.status === 404 || res.status === 401;
  return { ok: false, status: res.status, error: data.error || `Request failed (${res.status})`, stale };
}

export function DraftsReview({ drafts }: { drafts: Draft[] }) {
  const router = useRouter();
  // Keep a local copy so an approved/discarded row disappears immediately, even
  // if the background refresh is slow or (on a stale tab) fails to re-render.
  const [list, setList] = React.useState(drafts);
  React.useEffect(() => { setList(drafts); }, [drafts]);

  if (list.length === 0) {
    return <EmptyState icon={<FileText />} title="No drafts to review" description="Drafts created for this campaign will appear here for your approval." />;
  }
  return (
    <div className="space-y-4">
      {list.map((d) => (
        <DraftRow
          key={d.id}
          draft={d}
          onDone={() => { setList((cur) => cur.filter((x) => x.id !== d.id)); router.refresh(); }}
          onRefresh={() => router.refresh()}
        />
      ))}
    </div>
  );
}

function DraftRow({ draft, onDone, onRefresh }: { draft: Draft; onDone: () => void; onRefresh: () => void }) {
  const [subject, setSubject] = React.useState(draft.subject);
  const [body, setBody] = React.useState(draft.bodyText);
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");
  const dirty = subject !== draft.subject || body !== draft.bodyText;

  async function act(action: string) {
    setBusy(action);
    setError("");
    // Save edits first if the body changed and we're about to send.
    if (action === "send" && dirty) {
      const edit = await post({ action: "edit", id: draft.id, subject, bodyText: body });
      if (!edit.ok) { setError(edit.error || "Couldn't save your edits."); setBusy(""); return; }
    }
    const r = await post({ action, id: draft.id, ...(action === "edit" ? { subject, bodyText: body } : {}) });
    setBusy("");
    if (!r.ok) {
      setError(r.stale
        ? "This page is out of date (the app was updated). Reload the page, then try again."
        : (r.error || "That didn't work. Try again."));
      return;
    }
    if (action === "edit") { onRefresh(); return; } // stays in the list, just re-synced
    onDone(); // send / discard — the row leaves the review list
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span>To <b className="text-foreground">{draft.to}</b>{draft.business ? ` · ${draft.business}` : ""}</span>
      </div>
      <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mb-2 font-medium" />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="font-mono text-xs" />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => act("send")} disabled={!!busy}>{busy === "send" ? "Approving…" : "Approve & send"}</Button>
        {dirty && <Button size="sm" variant="secondary" onClick={() => act("edit")} disabled={!!busy}>Save edits</Button>}
        <Button size="sm" variant="ghost" onClick={() => act("discard")} disabled={!!busy}>Discard</Button>
      </div>
    </div>
  );
}
