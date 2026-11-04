"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MailCheck, Search, PenLine } from "lucide-react";

// Runs an action across EVERY lead matching the current filter (not just the
// page). The worker paces the jobs and each one still reserves budget.
export function BulkBar({
  matchCount, stage, q, campaign, qualification, hasContact,
}: {
  matchCount: number; stage?: string; q?: string; campaign?: string; qualification?: string; hasContact?: "yes" | "no";
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");

  async function run(action: "verify" | "research" | "draft") {
    if (matchCount === 0) return;
    const label = { verify: "Verify emails for", research: "Research", draft: "Draft outreach for" }[action];
    if (!confirm(`${label} ${matchCount.toLocaleString()} lead(s) matching this filter? Each runs within your daily budget.`)) return;
    setBusy(action); setMsg("");
    const res = await fetch("/api/leads/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, stage: stage || undefined, q: q || undefined, campaign: campaign || undefined, qualification: qualification || undefined, hasContact: hasContact || undefined }),
    });
    const data = await res.json();
    setBusy("");
    setMsg(res.ok ? `Queued ${action} for ${data.queued} lead(s). They'll process in the background.` : data.error || "Failed");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
      <span className="text-xs text-muted">Bulk actions on <b>{matchCount.toLocaleString()}</b> matching:</span>
      <Button size="sm" variant="outline" disabled={!!busy || !matchCount} onClick={() => run("verify")}>
        <MailCheck className="size-3.5" /> {busy === "verify" ? "Queuing…" : "Verify emails"}
      </Button>
      <Button size="sm" variant="outline" disabled={!!busy || !matchCount} onClick={() => run("research")}>
        <Search className="size-3.5" /> {busy === "research" ? "Queuing…" : "Research"}
      </Button>
      <Button size="sm" variant="outline" disabled={!!busy || !matchCount} onClick={() => run("draft")}>
        <PenLine className="size-3.5" /> {busy === "draft" ? "Queuing…" : "Draft outreach"}
      </Button>
      {msg && <span className="text-xs text-success">{msg}</span>}
    </div>
  );
}
