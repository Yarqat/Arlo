import * as React from "react";
import { cn } from "@/lib/cn";

/* Dependency-free, theme-aware charts. Server-safe (pure markup, no client JS).
   Colours come from --chart-1..3 (validated CVD-safe in both themes). Native
   <title> gives hover tooltips without any JavaScript. */

const CHART = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

function fmt(n: number) {
  return n.toLocaleString();
}

/**
 * Horizontal funnel: ordered steps, each bar's width ∝ value / first value, with
 * the step-to-step conversion shown on the right. Reads top-to-bottom as the
 * pipeline narrows.
 */
export function Funnel({ steps }: { steps: { label: string; value: number; hint?: string }[] }) {
  const top = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const w = Math.max((s.value / top) * 100, s.value > 0 ? 3 : 0);
        const conv = i === 0 ? null : (s.value / Math.max(steps[i - 1].value, 1)) * 100;
        return (
          <div key={s.label} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[9rem_1fr_auto]">
            <span className="truncate text-xs text-muted" title={s.label}>{s.label}</span>
            <div className="h-7 overflow-hidden rounded-lg bg-surface-2" title={s.hint ?? `${s.label}: ${fmt(s.value)}`}>
              <div className="h-full rounded-lg" style={{ width: `${w}%`, background: CHART[0] }} />
            </div>
            <span className="flex items-baseline gap-2 whitespace-nowrap text-right">
              <span className="w-14 text-right text-sm font-semibold tabular-nums">{fmt(s.value)}</span>
              <span className="w-10 text-right text-xs tabular-nums text-muted-2">{conv == null ? "" : `${conv.toFixed(0)}%`}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Donut for a small categorical split, with a center total and a legend. */
export function Donut({
  data,
  centerLabel,
}: {
  data: { label: string; value: number }[];
  centerLabel?: string;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const empty = total <= 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
      <svg viewBox="0 0 100 100" className="size-32 shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="13" />
        {!empty &&
          data.map((d, i) => {
            const frac = d.value / total;
            const len = frac * C;
            const seg = (
              <circle
                key={d.label}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={CHART[i % CHART.length]}
                strokeWidth="13"
                strokeDasharray={`${Math.max(len - 1.5, 0)} ${C - Math.max(len - 1.5, 0)}`}
                strokeDashoffset={-offset}
              >
                <title>{`${d.label}: ${fmt(d.value)} (${(frac * 100).toFixed(0)}%)`}</title>
              </circle>
            );
            offset += len;
            return seg;
          })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        {centerLabel && <p className="text-xs font-medium text-muted">{centerLabel}</p>}
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2.5 text-sm">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CHART[i % CHART.length] }} />
            <span className="min-w-0 flex-1 truncate text-muted">{d.label}</span>
            <span className="font-semibold tabular-nums">{fmt(d.value)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted-2">
              {empty ? "—" : `${((d.value / total) * 100).toFixed(0)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A ranked list of horizontal bars (one hue) with a value and optional rate. */
export function BarList({
  rows,
  className,
}: {
  rows: { label: string; value: number; sub?: string; href?: string }[];
  className?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className={cn("space-y-2.5", className)}>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate text-sm" title={r.label}>{r.label}</span>
          <span className="whitespace-nowrap text-right text-sm font-semibold tabular-nums">
            {fmt(r.value)} {r.sub && <span className="ml-1 text-xs font-normal text-muted-2">{r.sub}</span>}
          </span>
          <div className="col-span-2 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: CHART[0] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Linear gauge for a single value against a threshold (e.g. bounce rate vs. the
 * 3% safe line). Green below the line, red above it.
 */
export function Meter({
  value,
  threshold,
  max,
  unit = "%",
}: {
  value: number;
  threshold: number;
  max?: number;
  unit?: string;
}) {
  const top = max ?? Math.max(threshold * 2, value * 1.25, 1);
  const healthy = value < threshold;
  const pct = Math.min((value / top) * 100, 100);
  const tPct = Math.min((threshold / top) * 100, 100);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className={cn("text-2xl font-semibold tabular-nums", healthy ? "text-success" : "text-danger")}>
          {value.toFixed(1)}{unit}
        </span>
        <span className="text-xs text-muted">safe &lt; {threshold}{unit}</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: healthy ? "var(--success)" : "var(--danger)" }}
        />
        {/* threshold marker */}
        <div className="absolute inset-y-0 w-0.5 bg-foreground/50" style={{ left: `${tPct}%` }} title={`Threshold ${threshold}${unit}`} />
      </div>
    </div>
  );
}
