"use client";
import * as React from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark" | "system";
const KEY = "arlo-theme";

// Apply a theme choice to <html>. "system" removes the attribute so the
// prefers-color-scheme media query in globals.css takes over.
function apply(theme: Theme) {
  const el = document.documentElement;
  if (theme === "system") delete el.dataset.theme;
  else el.dataset.theme = theme;
}

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark") return t;
  } catch {}
  return "system";
}

function save(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {}
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Light/dark/system theme control. `icon` cycles through the three on a single
 * round button (for the top bar); `segmented` is a labelled three-way switch
 * (for Settings → Appearance). Persisted per-browser in localStorage.
 */
export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "segmented" }) {
  const [theme, setTheme] = React.useState<Theme>("system");
  // Read the real value after mount (server can't know localStorage).
  React.useEffect(() => setTheme(read()), []);

  function choose(next: Theme) {
    setTheme(next);
    save(next);
    apply(next);
  }

  if (variant === "segmented") {
    return (
      <div className="inline-flex rounded-full border border-border bg-surface-2 p-1">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = theme === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => choose(o.value)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" /> {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  // icon variant: cycle light → dark → system
  const idx = OPTIONS.findIndex((o) => o.value === theme);
  const current = OPTIONS[idx === -1 ? 2 : idx];
  const Icon = current.icon;
  const next = OPTIONS[(idx + 1) % OPTIONS.length].value;
  return (
    <button
      type="button"
      onClick={() => choose(next)}
      title={`Theme: ${current.label} — tap for ${next}`}
      aria-label={`Theme: ${current.label}. Switch to ${next}.`}
      className="flex size-10 items-center justify-center rounded-full border border-border text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
  );
}
