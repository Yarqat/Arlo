"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/interactive";
import Link from "next/link";
import { Send, Sparkles, Mic, Square, X, Volume2, VolumeX, Check } from "lucide-react";

type Pending = { tool: string; args: any; summary: string };
interface Msg {
  role: "user" | "assistant";
  content: string;
  actions?: { label: string; outcome?: string }[];
  link?: string;
  pending?: Pending;
  options?: string[];
}

type Mode = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

const SUGGESTIONS = [
  "Summarise my inbox.",
  "Show me interested leads from this week.",
  "Remind me to follow up with Acme tomorrow 15:00.",
  "What did you spend today?",
];

const MODE_LABEL: Record<Mode, string> = {
  idle: "", listening: "Listening…", transcribing: "Transcribing…", thinking: "Thinking…", speaking: "Speaking…",
};

export function AssistantChat({
  ready, assistantName, voiceEnabled, ttsEnabled, speakDefault, campaigns,
}: {
  ready: boolean;
  assistantName: string;
  voiceEnabled: boolean;
  ttsEnabled: boolean;
  speakDefault: boolean;
  campaigns: { id: string; name: string }[];
}) {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [mode, setMode] = React.useState<Mode>("idle");
  const [speak, setSpeak] = React.useState(speakDefault && ttsEnabled);
  const [err, setErr] = React.useState("");
  const scroller = React.useRef<HTMLDivElement>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const cancelRef = React.useRef(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);

  const busy = mode === "thinking" || mode === "transcribing";

  React.useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, mode]);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // ---- Text-less fallback is always available; voice is additive ----
  async function send(text: string, confirm?: Pending) {
    if ((!text.trim() && !confirm) || busy) return;
    const next = confirm ? messages : [...messages, { role: "user" as const, content: text }];
    if (!confirm) { setMessages(next); setInput(""); }
    setErr("");
    setMode("thinking");
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirm ? { messages: next, confirm: { tool: confirm.tool, args: confirm.args } } : { messages: next }),
      });
      const data = await res.json();
      const reply: Msg = {
        role: "assistant",
        content: data.reply ?? data.error ?? "Something went wrong.",
        actions: data.actions, link: data.link, pending: data.pending, options: data.options,
      };
      setMessages((m) => [...m, reply]);
      setMode("idle");
      if (speak && ttsEnabled && data.reply) speakText(data.reply);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Network error." }]);
      setMode("idle");
    }
  }

  // ---- Push-to-talk ----
  async function startRecording() {
    if (!voiceEnabled || mode !== "idle") return;
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? { mimeType: "audio/webm;codecs=opus" } : undefined);
      chunksRef.current = [];
      cancelRef.current = false;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stopTracks();
        if (cancelRef.current) { setMode("idle"); return; }
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size < 1200) { setMode("idle"); return; } // too short
        await transcribe(blob);
      };
      recorderRef.current = mr;
      mr.start();
      setMode("listening");
    } catch {
      setErr("Microphone permission denied or unavailable.");
      setMode("idle");
    }
  }

  function stopRecording() {
    if (recorderRef.current && mode === "listening") recorderRef.current.stop();
  }
  function cancelRecording() {
    cancelRef.current = true;
    if (recorderRef.current && mode === "listening") recorderRef.current.stop();
    else { stopTracks(); setMode("idle"); }
  }

  async function transcribe(blob: Blob) {
    setMode("transcribing");
    try {
      const res = await fetch("/api/assistant/transcribe", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
      const data = await res.json();
      if (data.text) {
        // Show the transcript in the box for review/edit BEFORE sending.
        setInput((prev) => (prev ? `${prev} ${data.text}` : data.text));
        inputRef.current?.focus();
      } else {
        setErr(data.error || "Could not transcribe that.");
      }
    } catch {
      setErr("Transcription failed.");
    } finally {
      setMode("idle");
    }
  }

  // ---- Spoken replies ----
  async function speakText(text: string) {
    try {
      const res = await fetch("/api/assistant/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: res.headers.get("content-type") || "audio/mpeg" }));
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setMode("idle"); URL.revokeObjectURL(url); };
      setMode("speaking");
      await audio.play();
    } catch {
      setMode("idle");
    }
  }
  function stopPlayback() {
    audioRef.current?.pause();
    audioRef.current = null;
    setMode("idle");
  }

  return (
    <div className="flex flex-col gap-4">
      {!ready && (
        <Alert tone="warning" title="Assistant model not assigned">
          Assign a model to the <b>Assistant</b> task in{" "}
          <Link href="/settings/connections" className="underline">Settings → Connections</Link> for full help.
        </Alert>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent-soft text-primary"><Sparkles className="size-4" /></span>
          <span className="font-medium">{assistantName}</span>
          {mode !== "idle" && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <span className={`size-2 rounded-full ${mode === "listening" ? "bg-danger animate-pulse" : mode === "speaking" ? "bg-primary animate-pulse" : "bg-amber-500 animate-pulse"}`} />
              {MODE_LABEL[mode]}
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted" title={ttsEnabled ? "" : "Configure a text-to-speech provider in Settings → Voice"}>
          {speak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          Speak replies
          <Switch checked={speak} onCheckedChange={setSpeak} disabled={!ttsEnabled} />
        </label>
      </div>

      {err && <Alert tone="danger">{err}</Alert>}

      <div ref={scroller} className="min-h-[320px] max-h-[56vh] overflow-y-auto rounded-lg border border-border bg-surface p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
            <p className="text-sm text-muted">Type, or hold the mic to talk. Try:</p>
            <div className="flex max-w-lg flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-border-strong px-3 py-1.5 text-xs hover:bg-surface-2">{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={m.role === "user" ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-fg" : "max-w-[85%] rounded-lg bg-surface-2 px-3 py-2 text-sm"}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.link && <Link href={m.link} className="mt-1 inline-block text-xs underline">Open →</Link>}
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.actions.map((a, j) => <Badge key={j} tone="info">{a.label}{a.outcome ? ` · ${a.outcome}` : ""}</Badge>)}
                    </div>
                  )}
                  {m.options && m.options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.options.map((o, j) => (
                        <button key={j} onClick={() => send(o)} className="rounded-full border border-border-strong px-2.5 py-1 text-xs hover:bg-surface">{o}</button>
                      ))}
                    </div>
                  )}
                  {m.pending && i === messages.length - 1 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => { const p = m.pending!; setMessages((x) => x.map((mm, k) => k === i ? { ...mm, pending: undefined } : mm)); send("", p); }}>
                        <Check className="size-3.5" /> Confirm
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setMessages((x) => x.map((mm, k) => k === i ? { ...mm, pending: undefined, content: mm.content + "\n(cancelled)" } : mm))}>Cancel</Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <p className="text-sm text-muted-2">{MODE_LABEL[mode] || "Working…"}</p>}
          </div>
        )}
      </div>

      {mode === "speaking" && (
        <Button variant="outline" size="sm" onClick={stopPlayback} className="self-start"><Square className="size-3.5" /> Stop playback</Button>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2">
        {voiceEnabled && (
          <div className="flex gap-1">
            <Button
              type="button" size="icon" className="h-11 w-11"
              variant={mode === "listening" ? "primary" : "outline"}
              disabled={mode === "transcribing" || mode === "thinking"}
              onPointerDown={startRecording}
              onPointerUp={stopRecording}
              title="Hold to talk"
            >
              {mode === "listening" ? <Square className="size-4" /> : <Mic className="size-4" />}
            </Button>
            {mode === "listening" && (
              <Button type="button" size="icon" variant="outline" className="h-11 w-11" onClick={cancelRecording} title="Cancel recording"><X className="size-4" /></Button>
            )}
          </div>
        )}
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder={voiceEnabled ? "Message Arlo, or hold the mic…" : "Message Arlo…"}
          className="min-h-11 flex-1 resize-none"
          rows={1}
        />
        <Button type="submit" disabled={busy || !input.trim()} size="icon" className="h-11 w-11"><Send className="size-4" /></Button>
      </form>

      {!voiceEnabled && (
        <p className="text-xs text-muted-2">Voice is off. Add a speech-to-text provider in <Link href="/settings/voice" className="underline">Settings → Voice</Link> to talk to {assistantName}.</p>
      )}
      {campaigns.length > 0 && <p className="text-xs text-muted-2">Active campaigns: {campaigns.map((c) => c.name).join(", ")}</p>}
    </div>
  );
}
