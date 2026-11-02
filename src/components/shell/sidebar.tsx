"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/cn";
import {
  LayoutDashboard,
  Sparkles,
  Users,
  Megaphone,
  Inbox as InboxIcon,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar({ ownerName, paused }: { ownerName: string; paused: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-fg">
            A
          </div>
          <span className="text-sm font-semibold">Arlo</span>
        </div>
        <button onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <aside
        className={cn(
          "flex w-60 shrink-0 flex-col border-r border-border bg-surface",
          "md:sticky md:top-0 md:h-screen",
          open ? "block" : "hidden md:flex",
        )}
      >
        <div className="hidden items-center gap-2 px-5 py-5 md:flex">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-fg">
            A
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Arlo</p>
            <p className="text-xs text-muted">Sales assistant</p>
          </div>
        </div>

        {paused && (
          <div className="mx-3 mb-2 rounded-md bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            Emergency pause active — no outbound actions.
          </div>
        )}

        <nav className="flex-1 space-y-0.5 px-3 py-2" onClick={() => setOpen(false)}>
          {NAV.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent-soft text-primary"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border px-3 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{ownerName}</p>
              <p className="text-xs text-muted">Owner</p>
            </div>
            <button
              onClick={logout}
              className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-foreground"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
