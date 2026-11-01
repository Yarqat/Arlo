import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { replyLabel, replyTone } from "@/lib/labels";
import { fmtDateTime } from "@/lib/time";
import { ThreadActions, ReplyBox } from "./thread-client";
import { ArrowLeft } from "lucide-react";
import sanitizeHtml from "sanitize-html";

export const dynamic = "force-dynamic";

export default async function ThreadView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [thread, settings] = await Promise.all([
    prisma.thread.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } }, lead: true, campaign: true },
    }),
    getSettings(),
  ]);
  if (!thread) notFound();

  return (
    <div className="space-y-5">
      <Link href="/inbox" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
        <ArrowLeft className="size-3" /> Inbox
      </Link>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">{thread.subject || "(no subject)"}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {thread.lead ? (
              <Link href={`/leads/${thread.lead.id}`} className="text-primary hover:underline">{thread.lead.businessName}</Link>
            ) : (
              <span>{thread.participants.join(", ")}</span>
            )}
            {thread.campaign && <Badge tone="neutral">{thread.campaign.name}</Badge>}
            {thread.labels.map((l) => <Badge key={l} tone="neutral">{l.replace(/_/g, " ")}</Badge>)}
            {thread.needsAttention && <Badge tone="warning">needs attention</Badge>}
          </div>
        </div>
        <ThreadActions threadId={thread.id} archived={thread.archived} linked={thread.isLinkedToLead} />
      </div>

      <div className="space-y-3">
        {thread.messages.map((m) => {
          const html = m.bodyHtml
            ? sanitizeHtml(m.bodyHtml, {
                allowedTags: sanitizeHtml.defaults.allowedTags.filter((t) => t !== "img" || !settings.blockRemoteImages),
                allowedAttributes: { a: ["href", "rel", "target"] },
                transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }) },
              })
            : null;
          const outbound = m.direction === "OUTBOUND";
          return (
            <Card key={m.id} className={outbound ? "border-l-2 border-l-primary" : ""}>
              <CardContent className="pt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2">
                    <Badge tone={outbound ? "primary" : "info"}>{outbound ? "sent" : "received"}</Badge>
                    <span className="font-medium">{outbound ? m.fromAddr || "you" : m.fromAddr}</span>
                    {m.classification !== "NONE" && <Badge tone={replyTone(m.classification)}>{replyLabel(m.classification)}</Badge>}
                    {m.isAutoReply && <Badge tone="neutral">auto</Badge>}
                  </span>
                  <span className="text-muted-2">{fmtDateTime(m.sentAt || m.receivedAt || m.createdAt, settings.timezone)}</span>
                </div>
                {html ? (
                  <div className="prose-sm max-w-none text-sm [&_a]:text-primary" dangerouslySetInnerHTML={{ __html: html }} />
                ) : (
                  <p className="whitespace-pre-wrap text-sm">{m.bodyText}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ReplyBox threadId={thread.id} />
    </div>
  );
}
