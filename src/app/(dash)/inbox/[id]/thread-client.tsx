"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

async function post(body: unknown) {
  const res = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

export function ThreadActions({ threadId, archived }: { threadId: string; archived: boolean; linked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    await post(body);
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex shrink-0 gap-2">
      <Button size="sm" variant="outline" onClick={() => act({ action: "resolve", threadId })} disabled={busy}>Mark resolved</Button>
      <Button size="sm" variant="ghost" onClick={() => act({ action: "archive", threadId, archived: !archived })} disabled={busy}>
        {archived ? "Unarchive" : "Archive"}
      </Button>
    </div>
  );
}

export function ReplyBox({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    setErr("");
    const r = await post({ action: "reply", threadId, body });
    setBusy(false);
    if (r.ok) {
      setBody("");
      router.refresh();
    } else {
      setErr(r.error || "Failed to send");
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Write a reply…" />
        {err && <p className="text-sm text-danger">{err}</p>}
        <div className="flex items-center gap-2">
          <Button onClick={send} disabled={busy || !body.trim()}>{busy ? "Sending…" : "Send reply"}</Button>
          <span className="text-xs text-muted-2">Replies are checked against the suppression list before sending.</span>
        </div>
      </CardContent>
    </Card>
  );
}
