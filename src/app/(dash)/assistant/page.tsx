import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/misc";
import { AssistantChat } from "./assistant-chat";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const assistantReady =
    (await prisma.modelAssignment.count({ where: { task: "ASSISTANT" } })) > 0;
  const campaigns = await prisma.campaign.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assistant"
        description="Ask in plain English. The assistant works within the same budgets, permissions and controls as every workflow."
      />
      <AssistantChat ready={assistantReady} campaigns={campaigns} />
    </div>
  );
}
