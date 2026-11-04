import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { ThreadConversation } from "../thread-conversation";

export const dynamic = "force-dynamic";

export default async function ThreadView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <Link href="/inbox" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
        <ArrowLeft className="size-3" /> Inbox
      </Link>
      <Card className="overflow-hidden p-0 lg:h-[calc(100vh-13rem)]">
        <ThreadConversation threadId={id} />
      </Card>
    </div>
  );
}
