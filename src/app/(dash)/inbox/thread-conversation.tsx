import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { replyLabel, replyTone } from "@/lib/labels";
import { fmtDateTime } from "@/lib/time";
import { ThreadActions, ReplyBox } from "./[id]/thread-client";
import sanitizeHtml from "sanitize-html";

/**
 * The right-hand reading pane: a full conversation with its messages and the
 * reply box. Shared by the two-pane Inbox and the standalone /inbox/[id] route.
 */
export async function ThreadConversation({ threadId }: { threadId: string }) {
  const [thread, settings] = await Promise.all([
    prisma.thread.findUnique({
      where: { id: threadId },
      include: { messages: { orderBy: { createdAt: "asc" } }, lead: true, campaign: true },
    }),
    getSettings(),
  ]);
  if (!thread) {
    return <p className="p-8 text-center text-sm text-muted">This conversation no longer exists.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{thread.subject || "(no subject)"}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {thread.lead ? (
              <Link href={`/leads/${thread.lead.id}`} className="text-primary hover:underline">{thread.lead.businessName}</Link>
            ) : (
              <span className="truncate">{thread.participants.join(", ")}</span>
            )}
            {thread.campaign && <Badge tone="neutral">{thread.campaign.name}</Badge>}
            {thread.needsAttention && <Badge tone="warning">needs attention</Badge>}
          </div>
        </div>
        <ThreadActions threadId={thread.id} archived={thread.archived} linked={thread.isLinkedToLead} />
      </div>

      {/* messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
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
            <div key={m.id} className={`rounded-2xl border border-border bg-surface p-4 ${outbound ? "border-l-2 border-l-primary" : ""}`}>
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
            </div>
          );
        })}
      </div>

      {/* reply */}
      <div className="border-t border-border px-5 py-4">
        <ReplyBox threadId={thread.id} />
      </div>
    </div>
  );
}
