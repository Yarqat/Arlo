import * as React from "react";
import { cn } from "@/lib/cn";

// SignalDesk-style dashboard primitives. Server-safe (pure SVG + markup).
const BLUE = "#2563eb";
const GREEN = "#16a34a";

export function TrendPill({ dir, text }: { dir: "up" | "down" | "flat"; text: string }) {
  const up = dir === "up", down = dir === "down";
  const cls = up ? "bg-success-soft text-success" : down ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", cls)}>
      {up ? "▲" : down ? "▼" : "•"} {text}
    </span>
  );
}

export function StatTile({
  icon, label, value, sub, trend, tone = "indigo",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  trend?: { dir: "up" | "down" | "flat"; text: string };
  tone?: "indigo" | "blue" | "green" | "amber" | "violet";
}) {
  const chip = {
    indigo: "bg-accent-soft text-primary",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950",
    green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950",
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className={cn("flex size-10 items-center justify-center rounded-xl", chip)}>{icon}</span>
        {trend && <TrendPill {...trend} />}
      </div>
      <p className="mt-4 text-[28px] font-semibold leading-none tracking-tight">{value}</p>
      <p className="mt-2 text-sm font-medium text-muted">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-2">{sub}</p>}
    </div>
  );
}

export function Panel({ title, subtitle, action, children, className }: { title?: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-5 shadow-sm", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-base font-semibold tracking-tight">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/** Grouped weekly bars: sent (blue) vs replies (green). */
export function WeeklyBars({ data }: { data: { label: string; sent: number; replies: number }[] }) {
  const W = 760, H = 230, pad = 28, base = H - 34, top = 12;
  const max = Math.max(1, ...data.flatMap((d) => [d.sent, d.replies]));
  const step = (W - pad * 2) / data.length;
  const bw = Math.min(16, step / 3.2);
  const h = (v: number) => (v / max) * (base - top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" className="overflow-visible">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={pad} x2={W - pad} y1={base - g * (base - top)} y2={base - g * (base - top)} stroke="var(--border)" strokeWidth="1" />
      ))}
      {data.map((d, i) => {
        const x = pad + i * step + step / 2;
        return (
          <g key={i}>
            <rect x={x - bw - 3} y={base - h(d.sent)} width={bw} height={h(d.sent)} rx="4" fill={BLUE} />
            <rect x={x + 3} y={base - h(d.replies)} width={bw} height={h(d.replies)} rx="4" fill={GREEN} />
            <text x={x} y={base + 18} textAnchor="middle" fontSize="11" fill="var(--muted)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-4">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-xs text-muted">
          <span className="size-2.5 rounded-sm" style={{ background: it.color }} /> {it.label}
        </span>
      ))}
    </div>
  );
}
export const CHART = { blue: BLUE, green: GREEN };

/** Horizontal funnel bars. */
export function Funnel({ stages }: { stages: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-2.5">
      {stages.map((s) => (
        <div key={s.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-muted">{s.label}</span>
          <div className="h-6 flex-1 overflow-hidden rounded-md bg-surface-2">
            <div className="flex h-full items-center rounded-md px-2" style={{ width: `${Math.max(6, (s.value / max) * 100)}%`, background: s.color }}>
              <span className="text-xs font-semibold text-white">{s.value.toLocaleString()}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Donut chart with centered total. */
export function Donut({ segments, centerLabel, centerValue }: { segments: { label: string; value: number; color: string }[]; centerLabel: string; centerValue: React.ReactNode }) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  const r = 54, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" width="140" height="140" className="shrink-0">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * c;
          const el = (
            <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="16"
              strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" strokeLinecap="butt" />
          );
          offset += dash;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--foreground)">{centerValue}</text>
        <text x="70" y="86" textAnchor="middle" fontSize="11" fill="var(--muted)">{centerLabel}</text>
      </svg>
      <div className="space-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-muted">{s.label}</span>
            <span className="ml-auto font-semibold">{s.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
