import { NextResponse } from "next/server";
import { ownerRoute } from "@/lib/api";
import { transcribe, NoSpeechProviderError, SpeechError } from "@/lib/providers/speech";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Accepts raw audio in the request body (Content-Type is the audio mime type).
// The audio is transcribed and discarded — never written to disk.
export const POST = ownerRoute(async (req) => {
  const mime = req.headers.get("content-type") || "audio/webm";
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: "No audio received" }, { status: 400 });
  if (buf.length > 20 * 1024 * 1024) return NextResponse.json({ error: "Recording too large" }, { status: 413 });
  try {
    const out = await transcribe(buf, mime);
    return NextResponse.json({ text: out.text, provider: out.provider });
  } catch (e) {
    if (e instanceof NoSpeechProviderError) return NextResponse.json({ error: e.message, kind: "no-provider" }, { status: 400 });
    if (e instanceof SpeechError) return NextResponse.json({ error: e.message, kind: "provider" }, { status: 502 });
    throw e;
  }
});
