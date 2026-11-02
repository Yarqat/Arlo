import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerRoute } from "@/lib/api";
import { synthesize, NoSpeechProviderError, SpeechError } from "@/lib/providers/speech";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ text: z.string().min(1).max(5000) });

export const POST = ownerRoute(async (req) => {
  const { text } = schema.parse(await req.json());
  try {
    const out = await synthesize(text);
    return new Response(new Uint8Array(out.audio), {
      status: 200,
      headers: { "Content-Type": out.contentType, "Cache-Control": "no-store", "X-Speech-Provider": out.provider },
    });
  } catch (e) {
    if (e instanceof NoSpeechProviderError) return NextResponse.json({ error: e.message, kind: "no-provider" }, { status: 400 });
    if (e instanceof SpeechError) return NextResponse.json({ error: e.message, kind: "provider" }, { status: 502 });
    throw e;
  }
});
