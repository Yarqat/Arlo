import { prisma } from "@/lib/db";
import { reserve } from "@/lib/budget";
import { resolveConfig } from "./secrets";
import { ProviderConnection } from "@prisma/client";
import { log } from "@/lib/log";

// Audio is never persisted: callers pass a Buffer that lives only for the
// duration of the request. We return text/audio and keep no raw recording.

export class SpeechError extends Error {}
export class NoSpeechProviderError extends Error {
  constructor(kind: "transcription" | "speech") {
    super(`No ${kind} provider is connected. Configure one in Settings → Voice & assistant.`);
    this.name = "NoSpeechProviderError";
  }
}

function providerOf(conn: ProviderConnection): string {
  return ((conn.meta as any)?.provider as string) || "openai";
}

const TIMEOUT = 60_000;
function withTimeout(): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

// --------------------------- Speech to text ---------------------------------

export interface TranscriptResult {
  text: string;
  provider: string;
  model: string;
  cost: number;
}

/** Very rough duration estimate from compressed audio size, for budgeting only. */
function estimateSeconds(bytes: number): number {
  // webm/opus at ~24 kbps ≈ 3 KB/s. Clamp to a sane floor.
  return Math.max(1, Math.round(bytes / 3000));
}

async function openaiTranscribe(cfg: Record<string, string | undefined>, audio: Buffer, mime: string): Promise<string> {
  const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = cfg.model || "whisper-1";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime || "audio/webm" }), `audio.${(mime.split("/")[1] || "webm").split(";")[0]}`);
  form.append("model", model);
  form.append("response_format", "json");
  const { signal, done } = withTimeout();
  try {
    const res = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
      signal,
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    if (!res.ok) throw new SpeechError(json?.error?.message || `OpenAI transcription error ${res.status}`);
    return json?.text ?? "";
  } finally {
    done();
  }
}

async function deepgramTranscribe(cfg: Record<string, string | undefined>, audio: Buffer, mime: string): Promise<string> {
  const base = (cfg.baseUrl || "https://api.deepgram.com/v1").replace(/\/$/, "");
  const model = cfg.model || "nova-2";
  const { signal, done } = withTimeout();
  try {
    const res = await fetch(`${base}/listen?model=${encodeURIComponent(model)}&smart_format=true&punctuate=true`, {
      method: "POST",
      headers: { Authorization: `Token ${cfg.apiKey}`, "Content-Type": mime || "audio/webm" },
      body: new Uint8Array(audio),
      signal,
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    if (!res.ok) throw new SpeechError(json?.err_msg || json?.error || `Deepgram error ${res.status}`);
    return json?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  } finally {
    done();
  }
}

export async function getActiveStt() {
  const conn = await prisma.providerConnection.findFirst({ where: { kind: "SPEECH_STT", status: "CONNECTED" } });
  if (!conn) throw new NoSpeechProviderError("transcription");
  const cfg = resolveConfig(conn);
  if (!cfg.apiKey) throw new NoSpeechProviderError("transcription");
  return { conn, cfg, provider: providerOf(conn) };
}

export async function transcribe(audio: Buffer, mime: string): Promise<TranscriptResult> {
  const { cfg, provider } = await getActiveStt();
  const perMin = cfg.costPerMinute ? Number(cfg.costPerMinute) : provider === "deepgram" ? 0.0043 : 0.006;
  const estCost = (estimateSeconds(audio.length) / 60) * perMin;
  const r = await reserve({ kind: "TRANSCRIPTION", estimatedCost: estCost, estimatedCount: 1, provider, note: "speech-to-text" });
  try {
    const text = provider === "deepgram" ? await deepgramTranscribe(cfg, audio, mime) : await openaiTranscribe(cfg, audio, mime);
    await r.commit(estCost, { provider, model: cfg.model || "", count: 1 });
    return { text: text.trim(), provider, model: cfg.model || "", cost: estCost };
  } catch (e) {
    await r.release();
    log.error("transcribe failed", { provider, err: (e as Error).message });
    throw e;
  }
}

// --------------------------- Text to speech ---------------------------------

export interface SpeechResult {
  audio: Buffer;
  contentType: string;
  provider: string;
  model: string;
  cost: number;
}

async function openaiSpeak(cfg: Record<string, string | undefined>, text: string): Promise<{ audio: Buffer; contentType: string; model: string }> {
  const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = cfg.model || "tts-1";
  const voice = cfg.voice || "alloy";
  const { signal, done } = withTimeout();
  try {
    const res = await fetch(`${base}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, voice, input: text, response_format: "mp3" }),
      signal,
    });
    if (!res.ok) {
      let msg = `OpenAI TTS error ${res.status}`;
      try { msg = (await res.json())?.error?.message || msg; } catch {}
      throw new SpeechError(msg);
    }
    return { audio: Buffer.from(await res.arrayBuffer()), contentType: "audio/mpeg", model };
  } finally {
    done();
  }
}

async function elevenlabsSpeak(cfg: Record<string, string | undefined>, text: string): Promise<{ audio: Buffer; contentType: string; model: string }> {
  const base = (cfg.baseUrl || "https://api.elevenlabs.io/v1").replace(/\/$/, "");
  const model = cfg.model || "eleven_turbo_v2_5";
  const voice = cfg.voice || "21m00Tcm4TlvDq8ikWAM"; // a default public voice id
  const { signal, done } = withTimeout();
  try {
    const res = await fetch(`${base}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": cfg.apiKey || "", "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: model }),
      signal,
    });
    if (!res.ok) {
      let msg = `ElevenLabs error ${res.status}`;
      try { msg = (await res.json())?.detail?.message || msg; } catch {}
      throw new SpeechError(msg);
    }
    return { audio: Buffer.from(await res.arrayBuffer()), contentType: "audio/mpeg", model };
  } finally {
    done();
  }
}

export async function getActiveTts() {
  const conn = await prisma.providerConnection.findFirst({ where: { kind: "SPEECH_TTS", status: "CONNECTED" } });
  if (!conn) throw new NoSpeechProviderError("speech");
  const cfg = resolveConfig(conn);
  if (!cfg.apiKey) throw new NoSpeechProviderError("speech");
  return { conn, cfg, provider: providerOf(conn) };
}

export async function synthesize(text: string): Promise<SpeechResult> {
  const { cfg, provider } = await getActiveTts();
  const clipped = text.slice(0, 5000); // guard runaway cost
  const perKChar = cfg.costPerKChar ? Number(cfg.costPerKChar) : provider === "elevenlabs" ? 0.3 : 0.015;
  const estCost = (clipped.length / 1000) * perKChar;
  const r = await reserve({ kind: "SPEECH", estimatedCost: estCost, estimatedCount: 1, provider, note: "text-to-speech" });
  try {
    const out = provider === "elevenlabs" ? await elevenlabsSpeak(cfg, clipped) : await openaiSpeak(cfg, clipped);
    await r.commit(estCost, { provider, model: out.model, count: 1 });
    return { ...out, provider, cost: estCost };
  } catch (e) {
    await r.release();
    log.error("synthesize failed", { provider, err: (e as Error).message });
    throw e;
  }
}

// ------------------------------- Tests ---------------------------------------

export async function testStt(conn: ProviderConnection): Promise<{ ok: boolean; error?: string }> {
  const cfg = resolveConfig(conn);
  if (!cfg.apiKey) return { ok: false, error: "No API key configured (set it here or in .env)." };
  // Synthesising a probe clip is out of scope; we validate the key against a
  // lightweight provider endpoint instead.
  try {
    const provider = providerOf(conn);
    if (provider === "deepgram") {
      const res = await fetch("https://api.deepgram.com/v1/projects", { headers: { Authorization: `Token ${cfg.apiKey}` } });
      if (!res.ok) return { ok: false, error: `Deepgram key rejected (${res.status})` };
    } else {
      const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
      const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
      if (!res.ok) return { ok: false, error: `OpenAI key rejected (${res.status})` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function testTts(conn: ProviderConnection): Promise<{ ok: boolean; error?: string }> {
  const cfg = resolveConfig(conn);
  if (!cfg.apiKey) return { ok: false, error: "No API key configured (set it here or in .env)." };
  const provider = providerOf(conn);
  try {
    // A tiny real synthesis is the surest check that model+voice+key all work.
    if (provider === "elevenlabs") await elevenlabsSpeak(cfg, "Ready.");
    else await openaiSpeak(cfg, "Ready.");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
