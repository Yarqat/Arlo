import { prisma } from "@/lib/db";
import { ConnectionKind } from "@prisma/client";
import { credentialSource } from "@/lib/providers/secrets";
import { SettingsBack } from "../settings-ui";
import { ConnectionsClient } from "./connections-client";
import { Alert } from "@/components/ui/misc";

export const dynamic = "force-dynamic";

const AI_KINDS: ConnectionKind[] = [
  ConnectionKind.AI_OPENAI,
  ConnectionKind.AI_ANTHROPIC,
  ConnectionKind.AI_CLAUDE_CODE,
];
const TASKS = [
  ["LEAD_QUALIFICATION", "Lead qualification"],
  ["WEBSITE_ANALYSIS", "Website analysis"],
  ["OUTREACH_WRITING", "Outreach writing"],
  ["REPLY_CLASSIFICATION", "Reply classification"],
  ["REPLY_DRAFTING", "Reply drafting"],
  ["ASSISTANT", "Assistant conversations"],
] as const;

export default async function ConnectionsPage() {
  const conns = await prisma.providerConnection.findMany({
    where: { kind: { in: AI_KINDS } },
    include: { models: { orderBy: { modelId: "asc" } } },
    orderBy: { kind: "asc" },
  });
  const assignments = await prisma.modelAssignment.findMany({ where: { campaignId: null } });

  const data = conns.map((c) => ({
    id: c.id,
    kind: c.kind,
    status: c.status,
    connectionType: c.connectionType,
    lastError: c.lastError,
    lastTestedAt: c.lastTestedAt?.toISOString() ?? null,
    source: credentialSource(c),
    discoveredModels: ((c.meta as any)?.discoveredModels as string[]) ?? [],
    models: c.models.map((m) => ({
      modelId: m.modelId,
      allowed: m.allowed,
      inputCostPerMTok: m.inputCostPerMTok ? Number(m.inputCostPerMTok) : null,
      outputCostPerMTok: m.outputCostPerMTok ? Number(m.outputCostPerMTok) : null,
    })),
  }));

  // Show the subscription-backed Claude Code option first (recommended: no API bill).
  const ORDER: Record<string, number> = { AI_CLAUDE_CODE: 0, AI_ANTHROPIC: 1, AI_OPENAI: 2 };
  data.sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9));

  const allowed = data.flatMap((c) =>
    c.models.filter((m) => m.allowed).map((m) => ({ connectionId: c.id, kind: c.kind, modelId: m.modelId })),
  );

  return (
    <div className="space-y-6">
      <SettingsBack title="AI connections & models" description="Recommended: Claude Code CLI runs on your own Claude subscription with no API bill. Or add an OpenAI/Anthropic API key (encrypted, or from the server .env). The assistant never uses a model you have not approved." />
      {allowed.length === 0 && (
        <Alert tone="info" title="No approved models yet">
          Add a key, run <b>Test connection</b> to discover models, approve the ones you want, then assign them to tasks below.
        </Alert>
      )}
      <ConnectionsClient
        connections={data}
        allowed={allowed}
        tasks={TASKS as unknown as [string, string][]}
        assignments={assignments.map((a) => ({ task: a.task, connectionId: a.connectionId, modelId: a.modelId }))}
      />
    </div>
  );
}
