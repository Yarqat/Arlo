import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import {
  User, Boxes, PlugZap, Search, MailCheck, Mails, Gauge, ShieldBan, Lock,
  DatabaseBackup, PenLine, ChevronRight, Bot, Zap, Check, ArrowRight, Palette,
} from "lucide-react";

export const dynamic = "force-dynamic";

// Plain-language groups. Each group gets one soft accent so the page reads as
// friendly colour-coded zones rather than a flat wall of 13 identical rows.
const GROUPS: {
  title: string;
  tone: "primary" | "success" | "info" | "warning";
  items: { href: string; icon: typeof User; title: string; desc: string }[];
}[] = [
  {
    title: "Connect your tools",
    tone: "primary",
    items: [
      { href: "/settings/connections", icon: PlugZap, title: "AI connections", desc: "Connect Claude, OpenAI, or your own CLI subscription — and pick models." },
      { href: "/settings/mailboxes", icon: Mails, title: "Mailboxes", desc: "The inboxes Arlo sends from — Gmail, Microsoft 365, or any SMTP." },
      { href: "/settings/search", icon: Search, title: "Finding leads", desc: "The search provider Arlo uses to discover businesses." },
      { href: "/settings/verifier", icon: MailCheck, title: "Email checking", desc: "Verify addresses are real before anything sends." },
    ],
  },
  {
    title: "Your pitch & voice",
    tone: "info",
    items: [
      { href: "/settings/profile", icon: User, title: "Profile & company", desc: "Your name, company, bio and signature." },
      { href: "/settings/services", icon: Boxes, title: "Services you offer", desc: "What Arlo is allowed to pitch, with examples." },
      { href: "/settings/writing", icon: PenLine, title: "Writing style", desc: "Your voice, tone, and claims Arlo must never make." },
      { href: "/settings/voice", icon: Bot, title: "Voice & assistant", desc: "Arlo's persona, speech providers, memory and daily briefing." },
    ],
  },
  {
    title: "Rules & safety",
    tone: "warning",
    items: [
      { href: "/settings/budgets", icon: Gauge, title: "Budgets & limits", desc: "Spend caps, send rates, and sending hours." },
      { href: "/settings/automation", icon: Zap, title: "Automation & alerts", desc: "Hot-reply alerts, email enrichment, your booking link." },
      { href: "/settings/suppression", icon: ShieldBan, title: "Do-not-contact list", desc: "Permanent opt-outs and hard bounces." },
    ],
  },
  {
    title: "Account",
    tone: "success",
    items: [
      { href: "/settings/security", icon: Lock, title: "Password & security", desc: "Password, sessions, and encryption status." },
      { href: "/settings/backups", icon: DatabaseBackup, title: "Backups", desc: "Back up and restore your database." },
    ],
  },
];

const TONE: Record<string, { tile: string }> = {
  primary: { tile: "bg-accent-soft text-primary" },
  info: { tile: "bg-info-soft text-info" },
  warning: { tile: "bg-warning-soft text-warning" },
  success: { tile: "bg-success-soft text-success" },
};

const AI_KINDS = ["AI_OPENAI", "AI_ANTHROPIC", "AI_CLAUDE_CODE", "AI_CODEX"];

export default async function SettingsHub() {
  const [ai, mailbox, verifier, campaigns] = await Promise.all([
    prisma.providerConnection.count({ where: { kind: { in: AI_KINDS as never }, status: "CONNECTED" } }),
    prisma.mailbox.count({ where: { status: "CONNECTED" } }),
    prisma.providerConnection.count({ where: { kind: "EMAIL_VERIFIER", status: "CONNECTED" } }),
    prisma.campaign.count(),
  ]);

  const steps = [
    { done: ai > 0, title: "Connect your AI", desc: "Powers Arlo's drafting and research.", href: "/settings/connections", required: true },
    { done: mailbox > 0, title: "Add a mailbox", desc: "So Arlo can send and read replies.", href: "/settings/mailboxes", required: true },
    { done: verifier > 0, title: "Turn on email checking", desc: "Optional, but protects your sending reputation.", href: "/settings/verifier", required: false },
    { done: campaigns > 0, title: "Create your first campaign", desc: "Describe who to reach, and let Arlo work.", href: "/campaigns/new", required: true },
  ];
  const requiredSteps = steps.filter((s) => s.required);
  const doneRequired = requiredSteps.filter((s) => s.done).length;
  const allDone = doneRequired === requiredSteps.length;
  const pct = Math.round((doneRequired / requiredSteps.length) * 100);
  const nextStep = steps.find((s) => !s.done);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">Everything in one place. Start with the checklist, then fine-tune anything below.</p>
      </div>

      {/* Guided setup */}
      {!allDone ? (
        <Card className="overflow-hidden border-0 bg-accent-soft shadow-sm">
          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary">Get set up</p>
              <p className="mt-0.5 text-sm text-foreground/70">
                {doneRequired} of {requiredSteps.length} essentials done. {nextStep ? `Next: ${nextStep.title.toLowerCase()}.` : ""}
              </p>
              <div className="mt-3 h-2.5 w-full max-w-md overflow-hidden rounded-full bg-surface/70">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            {nextStep && (
              <Link
                href={nextStep.href}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg shadow-sm transition-transform hover:scale-[1.02] active:scale-[.98]"
              >
                {nextStep.title} <ArrowRight className="size-4" />
              </Link>
            )}
          </div>
          <div className="grid gap-px bg-border/60 sm:grid-cols-2">
            {steps.map((s) => (
              <Link
                key={s.title}
                href={s.href}
                className="group flex items-center gap-3 bg-surface px-5 py-4 transition-colors hover:bg-surface-2"
              >
                <span
                  className={
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                    (s.done ? "bg-success text-white" : "border-2 border-border-strong text-transparent")
                  }
                >
                  <Check className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {s.title}
                    {!s.required && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">optional</span>}
                  </span>
                  <span className="block truncate text-xs text-muted">{s.desc}</span>
                </span>
                {!s.done && <ArrowRight className="size-4 shrink-0 text-muted-2 transition-transform group-hover:translate-x-0.5" />}
              </Link>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="flex items-center gap-4 border-0 bg-success-soft p-6 shadow-sm">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-success text-white">
            <Check className="size-6" />
          </span>
          <div>
            <p className="text-sm font-semibold text-success">You're all set up 🎉</p>
            <p className="text-sm text-foreground/70">Every essential is connected. Fine-tune anything below whenever you like.</p>
          </div>
        </Card>
      )}

      {/* Appearance — theme */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Appearance</h2>
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-foreground">
              <Palette className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-sm text-muted">Pick light, dark, or match your device.</p>
            </div>
          </div>
          <ThemeToggle variant="segmented" />
        </Card>
      </section>

      {/* Grouped settings */}
      {GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{group.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.items.map((s) => {
              const Icon = s.icon;
              return (
                <Link key={s.href} href={s.href}>
                  <Card className="flex h-full items-center gap-4 p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <span className={"flex size-12 shrink-0 items-center justify-center rounded-2xl " + TONE[group.tone].tile}>
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{s.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.desc}</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-2" />
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
