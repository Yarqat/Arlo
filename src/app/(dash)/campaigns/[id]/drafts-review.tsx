"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { FileText } from "lucide-react";

type Draft = { id: string; subject: string; bodyText: string; to: string; business: string };

type PostResult = {
  ok: boolean;
  status: number;
  error?: string;
  stale?: boolean;
  kind?: string; // "leak" | "spamword" | "rewrite" | ...
  canOverride?: boolean;
  subject?: string;
  bodyText?: string;
};

async function post(body: unknown): Promise<PostResult> {
  let res: Response;
  try {
    res = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server. Reload the page and try again.", stale: true };
  }
  let data: PostResult = { ok: false, status: res.status };
  try { data = { ...data, ...(await res.json()) }; } catch { /* empty body */ }
  if (res.ok) return { ...data, ok: true, status: res.status };
  const stale = res.status === 404 || res.status === 401;
  return { ...data, ok: false, status: res.status, error: data.error || `Request failed (${res.status})`, stale };
}

export function DraftsReview({ drafts }: { drafts: Draft[] }) {
  const router = useRouter();
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
  const [note, setNote] = React.useState("");
  const [canOverride, setCanOverride] = React.useState(false); // show "Send anyway"
  const dirty = subject !== draft.subject || body !== draft.bodyText;

  async function send(override: boolean) {
    setBusy("send");
    setError(""); setNote("");
    if (dirty) {
      const edit = await post({ action: "edit", id: draft.id, subject, bodyText: body });
      if (!edit.ok) { setError(edit.error || "Couldn't save your edits."); setBusy(""); return; }
    }
    const r = await post({ action: "send", id: draft.id, override });
    setBusy("");
    if (!r.ok) {
      setCanOverride(!!r.canOverride);
      setError(r.stale
        ? "This page is out of date (the app was updated). Reload the page, then try again."
        : (r.error || "That didn't work. Try again."));
      return;
    }
    onDone();
  }

  async function rewrite() {
    setBusy("rewrite");
    setError(""); setNote(""); setCanOverride(false);
    // Save any manual edits first so the rewrite works on what you see.
    if (dirty) {
      const edit = await post({ action: "edit", id: draft.id, subject, bodyText: body });
      if (!edit.ok) { setError(edit.error || "Couldn't save your edits."); setBusy(""); return; }
    }
    const r = await post({ action: "rewrite", id: draft.id });
    setBusy("");
    if (!r.ok) { setError(r.error || "Rewrite failed. Edit the draft by hand."); return; }
    if (r.subject != null) setSubject(r.subject);
    if (r.bodyText != null) setBody(r.bodyText);
    setNote("Rewritten to remove the flagged wording. Review it, then Approve & send.");
  }

  async function discard() {
    setBusy("discard");
    setError("");
    const r = await post({ action: "discard", id: draft.id });
    setBusy("");
    if (!r.ok) { setError(r.error || "Couldn't discard."); return; }
    onDone();
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span>To <b className="text-foreground">{draft.to}</b>{draft.business ? ` · ${draft.business}` : ""}</span>
      </div>
      <Input value={subject} onChange={(e) => { setSubject(e.target.value); setCanOverride(false); }} className="mb-2 font-medium" />
      <Textarea value={body} onChange={(e) => { setBody(e.target.value); setCanOverride(false); }} rows={6} className="font-mono text-xs" />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {note && <p className="mt-2 text-xs text-emerald-600">{note}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => send(false)} disabled={!!busy}>{busy === "send" ? "Approving…" : "Approve & send"}</Button>
        {canOverride && <Button size="sm" variant="secondary" onClick={() => send(true)} disabled={!!busy}>Send anyway</Button>}
        <Button size="sm" variant="secondary" onClick={rewrite} disabled={!!busy}>{busy === "rewrite" ? "Rewriting…" : "Rewrite"}</Button>
        <Button size="sm" variant="ghost" onClick={discard} disabled={!!busy}>Discard</Button>
      </div>
    </div>
  );
}
