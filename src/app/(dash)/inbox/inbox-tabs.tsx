"use client";
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/interactive";

export function InboxTabs({ active, attention, interested, sent }: { active: string; attention: number; interested: number; sent: number }) {
  const router = useRouter();
  return (
    <Tabs
      value={active}
      onChange={(v) => router.push(`/inbox?tab=${v}`)}
      tabs={[
        { value: "all", label: "All" },
        { value: "sent", label: "Sent", count: sent },
        { value: "attention", label: "Needs attention", count: attention },
        { value: "interested", label: "Interested", count: interested },
        { value: "out_of_office", label: "Out of office" },
        { value: "bounces", label: "Bounces" },
        { value: "unsubscribe", label: "Unsubscribes" },
        { value: "unmatched", label: "Unmatched" },
        { value: "archived", label: "Archived" },
      ]}
    />
  );
}
