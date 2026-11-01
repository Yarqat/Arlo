import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function OnboardingChecklist({
  hasAi,
  hasMailbox,
  hasCampaign,
}: {
  hasAi: boolean;
  hasMailbox: boolean;
  hasCampaign: boolean;
}) {
  const steps = [
    { done: hasAi, label: "Connect an AI provider and approve models", href: "/settings/connections" },
    { done: hasMailbox, label: "Add a sending mailbox (SMTP + IMAP)", href: "/settings/mailboxes" },
    { done: hasCampaign, label: "Create your first campaign", href: "/campaigns/new" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish setup</CardTitle>
        <CardDescription>A few connections unlock discovery, research and sending.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {steps.map((s) => (
            <li key={s.label}>
              <Link
                href={s.href}
                className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-2"
              >
                {s.done ? (
                  <Check className="size-4 text-success" />
                ) : (
                  <Circle className="size-4 text-muted-2" />
                )}
                <span className={s.done ? "text-muted line-through" : "text-foreground"}>{s.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
