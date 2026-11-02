import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox as InboxIcon } from "lucide-react";
import { relativeTime } from "@/lib/time";
import { InboxTabs } from "./inbox-tabs";

export const dynamic = "force-dynamic";

const FILTERS: Record<string, any> = {
  all: {},
  sent: { messages: { some: { direction: "OUTBOUND" } } },
  attention: { needsAttention: true },
  interested: { labels: { has: "interested" } },
  out_of_office: { labels: { has: "out_of_office" } },
  bounces: { labels: { has: "bounce" } },
  unsubscribe: { labels: { has: "unsubscribe" } },
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
    ]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Inbox" description="Unified conversations across your connected mailboxes." />
      <InboxTabs active={tab} attention={counts[0]} interested={counts[1]} sent={counts[2]} />

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
            return (
              <Link key={t.id} href={`/inbox/${t.id}`} className="block px-4 py-3 hover:bg-surface-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{t.subject || "(no subject)"}</p>
                      {t.needsAttention && <Badge tone="warning">Needs attention</Badge>}
                      {t.labels.map((l) => (
                        <Badge key={l} tone="neutral">{l.replace(/_/g, " ")}</Badge>
                      ))}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {t.lead ? t.lead.businessName : t.participants.join(", ")}
                      {last ? ` — ${last.snippet || last.bodyText.slice(0, 120)}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-2">{relativeTime(t.lastMessageAt)}</span>
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
