"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
  CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw, Loader2,
  ShieldCheck, Copy, Check, ChevronDown, Globe,
} from "lucide-react";

type CheckStatus = "pass" | "warn" | "fail" | "unknown";
type Check = { id: "spf" | "dkim" | "dmarc" | "mx"; label: string; status: CheckStatus; summary: string; value?: string; fix?: string };
type DomainReport = { domain: string; status: CheckStatus; score: number; checks: Check[]; checkedAt: string };

const TONE: Record<CheckStatus, { text: string; soft: string; ring: string; Icon: typeof CheckCircle2; word: string }> = {
  pass: { text: "text-success", soft: "bg-success-soft", ring: "text-success", Icon: CheckCircle2, word: "Protected" },
  warn: { text: "text-warning", soft: "bg-warning-soft", ring: "text-warning", Icon: AlertTriangle, word: "Needs attention" },
  fail: { text: "text-danger", soft: "bg-danger-soft", ring: "text-danger", Icon: XCircle, word: "At risk" },
  unknown: { text: "text-muted", soft: "bg-surface-2", ring: "text-muted-2", Icon: HelpCircle, word: "Unknown" },
};

function ScoreRing({ score, status }: { score: number; status: CheckStatus }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - score / 100);
  const tone = TONE[status];
  return (
    <div className="relative flex size-[76px] shrink-0 items-center justify-center">
      <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="6" className="text-border" stroke="currentColor" />
        <circle
          cx="38" cy="38" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
          className={cn(tone.ring, "transition-[stroke-dashoffset] duration-700 ease-out")}
          stroke="currentColor" strokeDasharray={c} strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn("text-xl font-semibold leading-none tabular-nums", tone.text)}>{score}</span>
        <span className="text-[9px] font-medium uppercase tracking-wide text-muted-2">score</span>
      </div>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground"
      title="Copy"
    >
      {done ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
    </button>
  );
}

function CheckPill({ check, open, onClick }: { check: Check; open: boolean; onClick: () => void }) {
  const tone = TONE[check.status];
  const Icon = tone.Icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all",
        open ? "border-border-strong bg-surface-2" : "border-border bg-surface hover:bg-surface-2",
      )}
    >
      <Icon className={cn("size-4 shrink-0", tone.text)} />
      <span className="text-xs font-semibold">{check.label}</span>
      <ChevronDown className={cn("size-3 text-muted-2 transition-transform", open && "rotate-180")} />
    </button>
  );
}

function DomainCard({ report, onRecheck, busy }: { report: DomainReport; onRecheck: () => void; busy: boolean }) {
  const [openId, setOpenId] = React.useState<Check["id"] | null>(() => {
    const firstBad = report.checks.find((c) => c.status !== "pass");
    return firstBad ? firstBad.id : null;
  });
  const tone = TONE[report.status];
  const open = report.checks.find((c) => c.id === openId) || null;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <ScoreRing score={report.score} status={report.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-muted-2" />
            <p className="truncate font-semibold tracking-tight">{report.domain}</p>
            <Badge tone={report.status === "pass" ? "success" : report.status === "warn" ? "warning" : report.status === "fail" ? "danger" : "neutral"}>
              {tone.word}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {report.status === "pass"
              ? "Your authentication is in good shape."
              : report.status === "fail"
                ? "Missing or broken records are hurting your inbox placement."
                : "A few tweaks will lift your inbox placement."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.checks.map((c) => (
              <CheckPill key={c.id} check={c} open={openId === c.id} onClick={() => setOpenId(openId === c.id ? null : c.id)} />
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onRecheck} disabled={busy} className="shrink-0 self-start">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Re-check
        </Button>
      </div>

      {open && (
        <div className="border-t border-border bg-surface-2/40 px-5 py-4">
          <div className="flex items-start gap-3">
            {React.createElement(TONE[open.status].Icon, { className: cn("mt-0.5 size-4 shrink-0", TONE[open.status].text) })}
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm font-medium">{open.summary}</p>
              {open.value && (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-muted">{open.value}</code>
                  <CopyBtn text={open.value} />
                </div>
              )}
              {open.fix && open.status !== "pass" && (
                <div className={cn("rounded-lg px-3 py-2.5", TONE[open.status].soft)}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">How to fix</p>
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm text-foreground/80">{open.fix}</p>
                    <CopyBtn text={open.fix} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export function DomainAuth({ domains }: { domains: { domain: string; selectors: string[] }[] }) {
  const [reports, setReports] = React.useState<DomainReport[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyDomain, setBusyDomain] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");

  const run = React.useCallback(async (only?: string) => {
    const payload = only ? domains.filter((d) => d.domain === only) : domains;
    if (only) setBusyDomain(only); else setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/deliverability/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check failed");
      setReports((prev) => {
        if (!prev || !only) return data.reports;
        const next = [...prev];
        for (const r of data.reports as DomainReport[]) {
          const i = next.findIndex((x) => x.domain === r.domain);
          if (i >= 0) next[i] = r; else next.push(r);
        }
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setBusyDomain(null);
    }
  }, [domains]);

  React.useEffect(() => { if (domains.length) run(); else setLoading(false); }, [run, domains.length]);

  if (domains.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 border-dashed border-border-strong p-10 text-center">
        <ShieldCheck className="size-7 text-muted-2" />
        <p className="text-sm font-medium">No sending domains yet</p>
        <p className="max-w-sm text-sm text-muted">Add a mailbox and we'll check its domain's SPF, DKIM and DMARC automatically.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {loading ? "Checking DNS…" : `Checked ${reports?.length ?? 0} domain${(reports?.length ?? 0) === 1 ? "" : "s"} · live from public DNS`}
        </p>
        <Button variant="ghost" size="sm" onClick={() => run()} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Re-check all
        </Button>
      </div>

      {error && (
        <Card className="border-danger/30 bg-danger-soft p-4 text-sm text-danger">{error}</Card>
      )}

      {loading && !reports && (
        <div className="space-y-4">
          {domains.map((d) => (
            <Card key={d.domain} className="flex items-center gap-4 p-5">
              <div className="size-[76px] shrink-0 animate-pulse rounded-full bg-surface-2" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
                <div className="flex gap-2">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="h-8 w-20 animate-pulse rounded-xl bg-surface-2" />)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {reports?.map((r) => (
        <DomainCard key={r.domain} report={r} busy={busyDomain === r.domain} onRecheck={() => run(r.domain)} />
      ))}
    </div>
  );
}

// --- DMARC report sync (Phase 2) -------------------------------------------
export function DmarcSync({ lastReportAt }: { lastReportAt: string | null }) {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const router = useRouter();

  async function sync() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/deliverability/dmarc/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setMsg(
        data.reports > 0
          ? `Imported ${data.reports} new report${data.reports === 1 ? "" : "s"}.`
          : data.mailboxes === 0
            ? "No connected mailboxes to scan."
            : "No new reports found.",
      );
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={sync} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Sync reports now
      </Button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
      {!msg && lastReportAt && (
        <span className="text-xs text-muted-2">Latest report {new Date(lastReportAt).toLocaleDateString()}</span>
      )}
    </div>
  );
}
