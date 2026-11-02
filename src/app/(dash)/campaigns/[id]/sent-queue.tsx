"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

type Msg = { id: string; to: string; business: string; subject: string; state: string; bodyText: string; when: string };

const STATUS: Record<string, { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" }> = {
  DELIVERED: { label: "Delivered", tone: "success" },
  ACCEPTED: { label: "Sent · accepted", tone: "success" },
  SENT: { label: "Sent", tone: "info" },
  SENDING: { label: "Sending…", tone: "info" },
  QUEUED: { label: "Queued", tone: "warning" },
  BOUNCED: { label: "Bounced", tone: "danger" },
  FAILED: { label: "Failed", tone: "danger" },
};
const PAGE = 12;

export function SentQueue({ messages }: { messages: Msg[] }) {
  const router = useRouter();
  const [page, setPage] = React.useState(0);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const pages = Math.max(1, Math.ceil(messages.length / PAGE));
  const slice = messages.slice(page * PAGE, page * PAGE + PAGE);

  if (messages.length === 0) return <p className="text-sm text-muted">Nothing sent yet. Approve a draft above to send it.</p>;

  return (
    <div>
      <div className="divide-y divide-border">
        {slice.map((m) => (
          <Row key={m.id} m={m} open={openId === m.id} onToggle={() => setOpenId(openId === m.id ? null : m.id)} onChange={() => router.refresh()} />
        ))}
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, messages.length)} of {messages.length}</span>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="size-3.5" /></Button>
            <span className="px-1">{page + 1} / {pages}</span>
            <Button size="icon" variant="outline" className="h-7 w-7" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}><ChevronRight className="size-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ m, open, onToggle, onChange }: { m: Msg; open: boolean; onToggle: () => void; onChange: () => void }) {
  const s = STATUS[m.state] ?? { label: m.state.toLowerCase(), tone: "neutral" as const };
  const editable = m.state === "DRAFT" || m.state === "QUEUED";
  const [subject, setSubject] = React.useState(m.subject);
  const [body, setBody] = React.useState(m.bodyText);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");

  async function post(action: string, extra?: object) {
    setBusy(action); setMsg("");
    const res = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: m.id, ...extra }) });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) { setMsg(data.error || "Failed"); return false; }
    onChange();
    return true;
  }

  return (
    <div className="py-2.5">
      <button onClick={onToggle} className="flex w-full items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{m.to}</p>
          <p className="truncate text-xs text-muted">{m.business ? `${m.business} · ` : ""}{m.subject}</p>
        </div>
        <Badge tone={s.tone}>{s.label}</Badge>
        <span className="w-14 shrink-0 text-right text-xs text-muted-2">{m.when}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-2 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
          {editable ? (
            <div className="space-y-2">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="font-medium" />
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="text-sm" />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={!!busy} onClick={() => post("edit", { subject, bodyText: body })}>{busy === "edit" ? "Saving…" : "Save changes"}</Button>
                {m.state === "QUEUED" && (
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => post("unqueue")} title="Stop it sending and move back to drafts">Pull back to draft</Button>
                )}
                {m.state === "DRAFT" && (
                  <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => post("send")}>Approve &amp; send</Button>
                )}
                <Button size="sm" variant="ghost" className="text-danger" disabled={!!busy} onClick={() => { if (confirm("Discard this email?")) post("discard"); }}>Discard</Button>
                {msg && <span className="text-xs text-danger">{msg}</span>}
              </div>
              <p className="text-xs text-muted-2">Queued emails can still be edited or pulled back until they actually send.</p>
            </div>
          ) : (
            <div>
              <p className="mb-1 text-sm font-medium">{m.subject}</p>
              <pre className="whitespace-pre-wrap font-sans text-sm text-muted">{m.bodyText}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
