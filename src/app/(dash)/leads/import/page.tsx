import { PageHeader } from "@/components/ui/misc";
import { ImportClient } from "./import-client";
import { ManualLead } from "./manual-lead";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const campaigns = await prisma.campaign.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Add leads" description="Import a CSV, or add a single business by hand. Rows are de-duplicated by domain and city." />
      <ImportClient campaigns={campaigns} />
      <ManualLead campaigns={campaigns} />
    </div>
  );
}
