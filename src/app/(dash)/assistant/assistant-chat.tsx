"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Send, Sparkles } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  actions?: { label: string; outcome?: string }[];
}

const SUGGESTIONS = [
  "Find 30 churches in Manchester with published emails and outdated websites.",
  "Show me interested leads from this week.",
  "What did you spend today?",
  "Pause all campaigns.",
];

export function AssistantChat({
  ready,
  campaigns,
}: {
  ready: boolean;
  campaigns: { id: string; name: string }[];
}) {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const scroller = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? data.error ?? "Something went wrong.", actions: data.actions },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Network error." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!ready && (
        <Alert tone="warning" title="Assistant model not assigned">
          Connect an AI provider and assign a model to the <b>Assistant</b> task in{" "}
          <Link href="/settings/connections" className="underline">Settings → Connections</Link>. You can still
          browse the suggestions below.
        </Alert>
      )}

      <div
        ref={scroller}
        className="min-h-[340px] max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-surface p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-primary">
              <Sparkles className="size-5" />
            </div>
            <p className="text-sm text-muted">Try one of these:</p>
            <div className="flex max-w-lg flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border-strong px-3 py-1.5 text-xs hover:bg-surface-2"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-fg"
                      : "max-w-[85%] rounded-lg bg-surface-2 px-3 py-2 text-sm"
                  }
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.actions.map((a, j) => (
                        <Badge key={j} tone="info">
                          {a.label}
                          {a.outcome ? ` · ${a.outcome}` : ""}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <p className="text-sm text-muted-2">Working…</p>}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Message the assistant…"
          className="min-h-11 flex-1 resize-none"
          rows={1}
        />
        <Button type="submit" disabled={busy || !input.trim()} size="icon" className="h-11 w-11">
          <Send className="size-4" />
        </Button>
      </form>
      {campaigns.length > 0 && (
        <p className="text-xs text-muted-2">
          Active campaigns: {campaigns.map((c) => c.name).join(", ")}
        </p>
      )}
    </div>
  );
}
