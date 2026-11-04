import Link from "next/link";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox as InboxIcon, ArrowLeft, MailOpen } from "lucide-react";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/cn";
import { InboxTabs } from "./inbox-tabs";
import { ThreadConversation } from "./thread-conversation";

export const dynamic = "force-dynamic";

const UNSUB_PHRASES = ["unsubscribe", "opt out", "opt-out", "remove me", "take me off", "stop emailing"];
const UNSUB_WHERE: Prisma.ThreadWhereInput = {
  OR: [
    { labels: { has: "unsubscribe" } },
    { messages: { some: { direction: "INBOUND", OR: UNSUB_PHRASES.map((s) => ({ bodyText: { contains: s, mode: "insensitive" as const } })) } } },
  ],
};
const REPLIES_WHERE: Prisma.ThreadWhereInput = { messages: { some: { direction: "INBOUND", classification: { not: "BOUNCE" } } } };

function labelTone(l: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (l === "interested") return "success";
  if (l === "bounce" || l === "unsubscribe") return "danger";
  if (l === "out_of_office" || l === "meeting") return "info";
  return "neutral";
}

const FILTERS: Record<string, Prisma.ThreadWhereInput> = {
  all: {},
  replies: REPLIES_WHERE,
  sent: { messages: { some: { direction: "OUTBOUND" } } },
  attention: { needsAttention: true },
  interested: { labels: { has: "interested" } },
  out_of_office: { labels: { has: "out_of_office" } },
  bounces: { labels: { has: "bounce" } },
  unsubscribe: UNSUB_WHERE,
  unmatched: { labels: { has: "unmatched" } },
  archived: { archived: true },
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string; id?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab && FILTERS[sp.tab] ? sp.tab : "all";
  const openId = sp.id;
  const where = { ...FILTERS[tab], ...(tab !== "archived" ? { archived: false } : {}) };

  const [threads, counts] = await Promise.all([
    prisma.thread.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      include: { lead: true, campaign: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    Promise.all([
      prisma.thread.count({ where: { needsAttention: true, archived: false } }),
      prisma.thread.count({ where: { labels: { has: "interested" }, archived: false } }),
      prisma.thread.count({ where: { messages: { some: { direction: "OUTBOUND" } }, archived: false } }),
      prisma.thread.count({ where: { ...REPLIES_WHERE, archived: false } }),
      prisma.thread.count({ where: { ...UNSUB_WHERE, archived: false } }),
    ]),
  ]);

  const tabHref = (id?: string) => `/inbox?tab=${tab}${id ? `&id=${id}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted">Every conversation across your mailboxes — matched to its lead and campaign.</p>
      </div>
      <InboxTabs active={tab} attention={counts[0]} interested={counts[1]} sent={counts[2]} replies={counts[3]} unsubscribe={counts[4]} />

      {threads.length === 0 && !openId ? (
        <EmptyState
          icon={<InboxIcon />}
          title="No conversations here"
          description="Once a mailbox is connected and syncing, incoming and sent messages appear as threads — matched to their lead and campaign."
        />
      ) : (
        <Card className="grid overflow-hidden p-0 lg:h-[calc(100vh-15rem)] lg:grid-cols-[minmax(300px,360px)_1fr]">
          {/* LEFT — thread list */}
          <div className={cn("min-w-0 flex-col border-border lg:flex lg:border-r lg:overflow-y-auto", openId ? "hidden" : "flex")}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3 text-xs text-muted">
              <span className="font-semibold uppercase tracking-wide">{tab === "all" ? "All" : tab.replace(/_/g, " ")}</span>
              <span>{threads.length} shown</span>
            </div>
            {threads.map((t) => {
              const last = t.messages[0];
              const who = t.lead ? t.lead.businessName : t.participants[0] || "(unknown)";
              const active = openId === t.id;
              return (
                <Link
                  key={t.id}
                  href={tabHref(t.id)}
                  className={cn(
                    "relative block border-b border-border px-4 py-3 transition-colors",
                    active ? "bg-accent-soft" : "hover:bg-surface-2",
                  )}
                >
                  {t.needsAttention && <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-warning" aria-hidden />}
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{who}</span>
                    <span className="shrink-0 text-xs text-muted-2">{relativeTime(t.lastMessageAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-foreground/90">{t.subject || "(no subject)"}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted">{last ? last.snippet || last.bodyText.slice(0, 140) : "No messages yet."}</p>
                  {(t.needsAttention || t.labels.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {t.needsAttention && <Badge tone="warning">attention</Badge>}
                      {t.labels.map((l) => <Badge key={l} tone={labelTone(l)}>{l.replace(/_/g, " ")}</Badge>)}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>

          {/* RIGHT — reading pane */}
          <div className={cn("min-w-0 flex-col", openId ? "flex" : "hidden lg:flex")}>
            {openId ? (
              <>
                <Link href={tabHref()} className="flex items-center gap-1 border-b border-border px-5 py-2 text-xs text-muted hover:text-foreground lg:hidden">
                  <ArrowLeft className="size-3" /> Back to list
                </Link>
                <div className="min-h-0 flex-1">
                  <ThreadConversation threadId={openId} />
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center text-muted">
                <MailOpen className="size-8 text-muted-2" />
                <p className="text-sm">Select a conversation to read it here.</p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
