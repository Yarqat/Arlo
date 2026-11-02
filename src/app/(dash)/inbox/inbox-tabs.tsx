"use client";
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/interactive";

export function InboxTabs({ active, attention, interested, sent, replies, unsubscribe }: { active: string; attention: number; interested: number; sent: number; replies: number; unsubscribe: number }) {
  const router = useRouter();
  return (
    <Tabs
      value={active}
      onChange={(v) => router.push(`/inbox?tab=${v}`)}
      tabs={[
        { value: "all", label: "All" },
        { value: "replies", label: "Replies", count: replies },
        { value: "sent", label: "Sent", count: sent },
        { value: "attention", label: "Needs attention", count: attention },
        { value: "interested", label: "Interested", count: interested },
        { value: "out_of_office", label: "Out of office" },
        { value: "bounces", label: "Bounces" },
        { value: "unsubscribe", label: "Unsubscribes", count: unsubscribe },
        { value: "unmatched", label: "Unmatched" },
        { value: "archived", label: "Archived" },
      ]}
    />
  );
}
