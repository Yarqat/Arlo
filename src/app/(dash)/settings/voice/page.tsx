import { prisma } from "@/lib/db";
import { credentialSource } from "@/lib/providers/secrets";
import { decryptJson } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SettingsBack } from "../settings-ui";
import { AssistantPrefs, SpeechProviderForm, MemoryEditor } from "./voice-ui";
import { ConnectionKind } from "@prisma/client";

export const dynamic = "force-dynamic";

async function speechConn(kind: ConnectionKind) {
  const conn = await prisma.providerConnection.upsert({
    where: { kind_name: { kind, name: "default" } },
    create: { kind, name: "default" },
    update: {},
  });
  const cfg = (conn.configEnc ? decryptJson<Record<string, string>>(conn.configEnc) : {}) ?? {};
  return { conn, model: cfg.model || "", voice: cfg.voice || "" };
}

export default async function VoicePage() {
  const settings = await getSettings();
  const [stt, tts, memory] = await Promise.all([
    speechConn("SPEECH_STT"),
    speechConn("SPEECH_TTS"),
    prisma.assistantMemory.findMany({ orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }] }),
  ]);

  return (
    <div className="space-y-6">
      <SettingsBack title="Voice & assistant" description="Arlo is your in-CRM assistant. It uses your assigned reasoning model for thinking, and separate speech providers for voice." />

      <Card>
        <CardHeader><CardTitle>Assistant</CardTitle><CardDescription>Persona, spoken replies and the optional daily briefing.</CardDescription></CardHeader>
        <CardContent>
          <AssistantPrefs
            name={settings.assistantName}
            speak={settings.assistantSpeakByDefault}
            briefing={settings.dailyBriefingEnabled}
            briefingHour={settings.dailyBriefingHour}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Speech-to-text (listening)</CardTitle>
          <CardDescription>Used only when you activate voice. Audio is transcribed and discarded — recordings are never stored.</CardDescription>
        </CardHeader>
        <CardContent>
          <SpeechProviderForm
            kind="SPEECH_STT"
            providers={[{ value: "openai", label: "OpenAI (Whisper / gpt-4o-transcribe)" }, { value: "deepgram", label: "Deepgram" }]}
            status={stt.conn.status}
            source={credentialSource(stt.conn)}
            currentProvider={(stt.conn.meta as any)?.provider ?? "openai"}
            model={stt.model}
            voice=""
            lastError={stt.conn.lastError}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Text-to-speech (Arlo's voice)</CardTitle>
          <CardDescription>Used only when spoken replies are on. Kept separate from your reasoning model.</CardDescription>
        </CardHeader>
        <CardContent>
          <SpeechProviderForm
            kind="SPEECH_TTS"
            providers={[{ value: "openai", label: "OpenAI (tts-1 / gpt-4o-mini-tts)" }, { value: "elevenlabs", label: "ElevenLabs" }]}
            status={tts.conn.status}
            source={credentialSource(tts.conn)}
            currentProvider={(tts.conn.meta as any)?.provider ?? "openai"}
            model={tts.model}
            voice={tts.voice}
            lastError={tts.conn.lastError}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Memory</CardTitle><CardDescription>Durable, editable. Saved preferences — distinct from the temporary context of a single conversation.</CardDescription></CardHeader>
        <CardContent>
          <MemoryEditor initial={memory.map((m) => ({ id: m.id, scope: m.scope, title: m.title, content: m.content }))} />
        </CardContent>
      </Card>
    </div>
  );
}
