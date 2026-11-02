"use client";
import * as React from "react";
import { Input, Field } from "@/components/ui/input";
import { Switch } from "@/components/ui/interactive";
import { useSave, SaveButton } from "../settings-ui";

type A = {
  hotReplyNotify: boolean;
  notifyEmail: string;
  enrichEmails: boolean;
  trackClicks: boolean;
  bookingUrl: string;
  hasCalcomKey: boolean;
};

function Row({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function AutomationForm({ initial }: { initial: A }) {
  const { save, state, error } = useSave("/api/settings/global");
  const [a, setA] = React.useState(initial);
  const [calcomKey, setCalcomKey] = React.useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const body: Record<string, unknown> = {
          hotReplyNotify: a.hotReplyNotify,
          notifyEmail: a.notifyEmail,
          enrichEmails: a.enrichEmails,
          trackClicks: a.trackClicks,
          bookingUrl: a.bookingUrl,
        };
        // Only send the key when the owner typed one, so we never wipe it by accident.
        if (calcomKey.trim()) body.calcomApiKey = calcomKey.trim();
        save(body);
      }}
      className="space-y-5"
    >
      <Row
        label="Email me when a hot reply arrives"
        hint="Interested, pricing, meeting and info-request replies trigger an instant email to you."
        checked={a.hotReplyNotify}
        onChange={(v) => setA({ ...a, hotReplyNotify: v })}
      />
      <Field label="Send alerts to" hint="Leave blank to use your login email." className="max-w-md">
        <Input type="email" placeholder="you@example.com" value={a.notifyEmail} onChange={(e) => setA({ ...a, notifyEmail: e.target.value })} />
      </Field>

      <Row
        label="Find emails on prospect websites"
        hint="During research, Arlo scrapes mailto: links and on-page addresses so leads without a contact become reachable. Free — no external service."
        checked={a.enrichEmails}
        onChange={(v) => setA({ ...a, enrichEmails: v })}
      />

      <Row
        label="Track link clicks"
        hint="Wraps links in outgoing emails so clicks are logged (shown in Reports). No open tracking — we never embed tracking pixels. The unsubscribe link is never wrapped."
        checked={a.trackClicks}
        onChange={(v) => setA({ ...a, trackClicks: v })}
      />

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <p className="text-sm font-medium">Your booking link (Cal.com / Google Calendar)</p>
          <p className="text-xs text-muted">
            Paste your own public scheduling link. When a prospect is interested, Arlo offers it in the
            suggested reply so they can book a time with you. Your link and key stay yours — nothing is shared.
          </p>
        </div>
        <Field label="Scheduling link">
          <Input placeholder="https://cal.com/your-name/intro" value={a.bookingUrl} onChange={(e) => setA({ ...a, bookingUrl: e.target.value })} />
        </Field>
        <Field label="Cal.com API key (optional)" hint={a.hasCalcomKey ? "A key is saved. Type a new one to replace it, or leave blank to keep it." : "Optional — reserved for showing live availability. The booking link alone is enough."}>
          <Input type="password" placeholder={a.hasCalcomKey ? "•••••••• (saved)" : "cal_live_…"} value={calcomKey} onChange={(e) => setCalcomKey(e.target.value)} />
        </Field>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <SaveButton state={state} />
    </form>
  );
}
