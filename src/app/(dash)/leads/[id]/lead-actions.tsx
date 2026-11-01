"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { stageLabel } from "@/lib/labels";
import { Search, MailCheck, PenLine } from "lucide-react";

const STAGES = [
  "NEW","RESEARCHING","QUALIFIED","READY_FOR_REVIEW","SCHEDULED","CONTACTED","REPLIED",
  "INTERESTED","MEETING_REQUESTED","MEETING_BOOKED","PROPOSAL_NEEDED","WON","LOST","NOT_INTERESTED","SUPPRESSED",
];

export function LeadActions({ leadId, stage }: { leadId: string; stage: string }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState("");

  async function act(type: string, extra?: Record<string, unknown>) {
    setBusy(type);
    const res = await fetch(`/api/leads/${leadId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...extra }),
    });
    const data = await res.json();
    setBusy("");
    if (res.ok) {
      setMsg(type === "stage" ? "Stage updated" : `Queued ${type}`);
      setTimeout(() => setMsg(""), 2500);
      router.refresh();
    } else {
      setMsg(data.error || "Failed");
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy === "research"} onClick={() => act("research")}>
          <Search className="size-3" /> Research
        </Button>
        <Button variant="outline" size="sm" disabled={busy === "verify"} onClick={() => act("verify")}>
          <MailCheck className="size-3" /> Verify
        </Button>
        <Button variant="outline" size="sm" disabled={busy === "draft"} onClick={() => act("draft")}>
          <PenLine className="size-3" /> Draft outreach
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Select
          defaultValue={stage}
          className="h-8 text-xs"
          onChange={(e) => act("stage", { stage: e.target.value })}
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>{stageLabel(s)}</option>
          ))}
        </Select>
      </div>
      {msg && <span className="text-xs text-success">{msg}</span>}
    </div>
  );
}
