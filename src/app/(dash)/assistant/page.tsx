import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/misc";
import { AssistantChat } from "./assistant-chat";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const [assignCount, campaigns, stt, tts, settings] = await Promise.all([
    prisma.modelAssignment.count({ where: { task: "ASSISTANT" } }),
    prisma.campaign.findMany({ where: { status: { not: "ARCHIVED" } }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
    prisma.providerConnection.findFirst({ where: { kind: "SPEECH_STT", status: "CONNECTED" }, select: { id: true } }),
    prisma.providerConnection.findFirst({ where: { kind: "SPEECH_TTS", status: "CONNECTED" }, select: { id: true } }),
    getSettings(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assistant"
        description={`${settings.assistantName} works within the same budgets, permissions, suppression and confirmation rules as every workflow — by voice or text.`}
      />
      <AssistantChat
        ready={assignCount > 0}
        assistantName={settings.assistantName}
        voiceEnabled={!!stt}
        ttsEnabled={!!tts}
        speakDefault={settings.assistantSpeakByDefault}
        campaigns={campaigns}
      />
    </div>
  );
}
