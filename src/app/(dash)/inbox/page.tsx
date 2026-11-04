import Link from "next/link";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox as InboxIcon } from "lucide-react";
import { relativeTime } from "@/lib/time";
import { InboxTabs } from "./inbox-tabs";

export const dynamic = "force-dynamic";

// Phrases that signal an opt-out in a reply body. Matched case-insensitively so
// the Unsubscribes tab works even when the AI reply classifier never ran (e.g.
// the reply was never matched to a lead) and so no "unsubscribe" label was set.
const UNSUB_PHRASES = ["unsubscribe", "opt out", "opt-out", "remove me", "take me off", "stop emailing"];
const UNSUB_WHERE: Prisma.ThreadWhereInput = {
  OR: [
    { labels: { has: "unsubscribe" } },
    {
      messages: {
        some: {
          direction: "INBOUND",
          OR: UNSUB_PHRASES.map((s) => ({ bodyText: { contains: s, mode: "insensitive" as const } })),
        },
      },
    },
  ],
};
// A "reply" is any inbound human message — anything we received that isn't a
// bounce/DSN (those get their own Bounces tab).
const REPLIES_WHERE: Prisma.ThreadWhereInput = { messages: { some: { direction: "INBOUND", classification: { not: "BOUNCE" } } } };

// Soft avatar colours, picked deterministically from the sender name.
const AV = [
  "bg-info-soft text-info",
  "bg-success-soft text-success",
  "bg-warning-soft text-warning",
  "bg-accent-soft text-primary",
  "bg-danger-soft text-danger",
];
function avatarClass(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AV[h % AV.length];
}
function labelTone(l: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (l === "interested") return "success";
  if (l === "bounce" || l === "unsubscribe") return "danger";
  if (l === "out_of_office" || l === "meeting") return "info";
  return "neutral";
}

const FILTERS: Record<string, any> = {
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

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab && FILTERS[sp.tab] ? sp.tab : "all";
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted">Every conversation across your mailboxes — matched to its lead and campaign.</p>
      </div>
      <InboxTabs active={tab} attention={counts[0]} interested={counts[1]} sent={counts[2]} replies={counts[3]} unsubscribe={counts[4]} />

      {threads.length === 0 ? (
        <EmptyState
          icon={<InboxIcon />}
          title="No conversations here"
          description="Once a mailbox is connected and syncing, incoming and sent messages appear as threads — matched to their lead and campaign."
        />
      ) : (
        <Card className="divide-y divide-border p-0">
          {threads.map((t) => {
            const last = t.messages[0];
            const who = t.lead ? t.lead.businessName : t.participants[0] || "(unknown)";
            const initial = who.trim().charAt(0).toUpperCase() || "?";
            const inbound = last?.direction === "INBOUND";
            return (
              <Link
                key={t.id}
                href={`/inbox/${t.id}`}
                className="group relative flex items-start gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2"
              >
                {/* attention accent */}
                {t.needsAttention && <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-warning" aria-hidden />}
                <span className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarClass(who)}`}>
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{who}</span>
                      {inbound && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">reply</span>}
                    </p>
                    <span className="shrink-0 text-xs text-muted-2">{relativeTime(t.lastMessageAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-foreground/90">{t.subject || "(no subject)"}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {last ? last.snippet || last.bodyText.slice(0, 140) : "No messages yet."}
                  </p>
                  {(t.needsAttention || t.labels.length > 0 || t.campaign) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {t.needsAttention && <Badge tone="warning">Needs attention</Badge>}
                      {t.labels.map((l) => (
                        <Badge key={l} tone={labelTone(l)}>{l.replace(/_/g, " ")}</Badge>
                      ))}
                      {t.campaign && <span className="text-[11px] text-muted-2">· {t.campaign.name}</span>}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
