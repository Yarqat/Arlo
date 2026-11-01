import { PageHeader } from "@/components/ui/misc";
import { BriefEditor } from "./brief-editor";

export const dynamic = "force-dynamic";

export default function NewCampaignPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="New campaign" description="Describe the leads you want in plain English. The assistant turns it into an editable brief." />
      <BriefEditor />
    </div>
  );
}
