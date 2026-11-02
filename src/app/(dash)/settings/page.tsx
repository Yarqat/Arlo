import Link from "next/link";
import { PageHeader } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import {
  User, Boxes, PlugZap, Search, MailCheck, Mails, Gauge, ShieldBan, Lock, DatabaseBackup, PenLine, ChevronRight, Bot,
} from "lucide-react";

const SECTIONS = [
  { href: "/settings/profile", icon: User, title: "Profile & Yarqat details", desc: "Your name, company, bio and signature." },
  { href: "/settings/services", icon: Boxes, title: "Services & portfolio", desc: "Approved service descriptions and examples." },
  { href: "/settings/writing", icon: PenLine, title: "Writing preferences", desc: "Voice, style and prohibited claims." },
  { href: "/settings/connections", icon: PlugZap, title: "AI connections & models", desc: "OpenAI, Anthropic, Claude Code. Model allowlist." },
  { href: "/settings/voice", icon: Bot, title: "Voice & assistant", desc: "Arlo persona, speech providers, memory, daily briefing." },
  { href: "/settings/search", icon: Search, title: "Search provider", desc: "Discovery API for finding businesses." },
  { href: "/settings/verifier", icon: MailCheck, title: "Email verifier", desc: "Deliverability checks through an adapter." },
  { href: "/settings/mailboxes", icon: Mails, title: "Mailboxes", desc: "Sending identities, SMTP and IMAP." },
  { href: "/settings/budgets", icon: Gauge, title: "Budgets, limits & schedules", desc: "Spend, rate limits, sending hours." },
  { href: "/settings/suppression", icon: ShieldBan, title: "Suppression list", desc: "Permanent opt-outs and hard bounces." },
  { href: "/settings/security", icon: Lock, title: "Security", desc: "Password, sessions, encryption status." },
  { href: "/settings/backups", icon: DatabaseBackup, title: "Backups & retention", desc: "Database backup and restore." },
];

export default function SettingsHub() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Simple controls first; advanced options live inside each section." />
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href}>
              <Card className="flex items-center gap-4 px-4 py-4 transition-colors hover:border-border-strong hover:bg-surface-2">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-primary">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="truncate text-xs text-muted">{s.desc}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-2" />
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
