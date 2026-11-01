"use client";
import * as React from "react";
import { Input, Textarea, Field } from "@/components/ui/input";
import { useSave, SaveButton } from "../settings-ui";

type B = {
  timezone: string;
  dailySpendLimit: number;
  monthlySpendLimit: number;
  dailyAiRequests: number;
  dailyTokens: number;
  dailyNewLeads: number;
  dailyResearch: number;
  dailyEmail: number;
  hourlyEmail: number;
  maxFollowUps: number;
  maxPagesPerLead: number;
  maxRetriesPerJob: number;
  maxJobSeconds: number;
  verificationStaleDays: number;
  retentionDays: number;
  unsubscribeFooter: string;
};

const NUM_FIELDS: { key: keyof B; label: string; hint?: string }[] = [
  { key: "dailySpendLimit", label: "Daily spend limit ($)" },
  { key: "monthlySpendLimit", label: "Monthly spend limit ($)" },
  { key: "dailyAiRequests", label: "Daily AI requests" },
  { key: "dailyTokens", label: "Daily token limit" },
  { key: "dailyNewLeads", label: "Daily new leads" },
  { key: "dailyResearch", label: "Daily research runs" },
  { key: "dailyEmail", label: "Daily emails" },
  { key: "hourlyEmail", label: "Hourly emails" },
  { key: "maxFollowUps", label: "Max follow-ups per lead" },
  { key: "maxPagesPerLead", label: "Max pages fetched per lead" },
  { key: "maxRetriesPerJob", label: "Max retries per job" },
  { key: "maxJobSeconds", label: "Max seconds per job" },
  { key: "verificationStaleDays", label: "Re-verify after (days)" },
  { key: "retentionDays", label: "Retention (days, 0 = keep)" },
];

export function BudgetsForm({ initial }: { initial: B }) {
  const { save, state, error } = useSave("/api/settings/global");
  const [b, setB] = React.useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(b);
      }}
      className="space-y-5"
    >
      <Field label="Reporting timezone" className="max-w-xs">
        <Input value={b.timezone} onChange={(e) => setB({ ...b, timezone: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {NUM_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              type="number"
              step="any"
              value={b[f.key] as number}
              onChange={(e) => setB({ ...b, [f.key]: e.target.value === "" ? 0 : Number(e.target.value) })}
            />
          </Field>
        ))}
      </div>
      <Field label="Unsubscribe footer" hint="{{unsubscribe_url}} is replaced with the recipient's one-click link.">
        <Textarea value={b.unsubscribeFooter} onChange={(e) => setB({ ...b, unsubscribeFooter: e.target.value })} rows={2} />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <SaveButton state={state} />
    </form>
  );
}
