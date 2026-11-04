import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Yarqat "Y" mark, recreated as inline SVG so it stays crisp at any size and in
 * both themes. The asymmetric Y: a grey left arm, a white stem + right arm, on a
 * near-black rounded tile. Swap for the official asset by dropping it in
 * public/ and pointing an <img> here instead.
 */
export function YarqatMark({ className, tile = true }: { className?: string; tile?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={cn(className)} role="img" aria-label="Yarqat">
      {tile && <rect x="1.5" y="1.5" width="97" height="97" rx="24" fill="#0a0a0b" />}
      <g
        strokeWidth="15"
        strokeLinecap="butt"
        fill="none"
      >
        {/* grey left arm (drawn first so the white overlaps at the junction) */}
        <line x1="50" y1="57" x2="29.5" y2="34" stroke="#8c8c92" />
        {/* white stem + right arm */}
        <line x1="50" y1="86" x2="50" y2="55" stroke="#ffffff" />
        <line x1="50" y1="57" x2="71.5" y2="21" stroke="#ffffff" />
      </g>
    </svg>
  );
}

/** Lockup used in the top bar: the Yarqat mark + the product name. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <YarqatMark className="size-9 shrink-0 rounded-xl shadow-sm ring-1 ring-black/5" />
      <span className="hidden text-base font-semibold tracking-tight sm:block">Arlo</span>
    </span>
  );
}
