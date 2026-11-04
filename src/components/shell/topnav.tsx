"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "./theme-toggle";
import { BrandLockup } from "./brand";
import {
  LayoutDashboard, Sparkles, Users, Megaphone, Inbox as InboxIcon,
  BarChart3, Settings as SettingsIcon, LogOut, Menu, X, Search, Bell,
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

export function TopNav({ ownerName, paused }: { ownerName: string; paused: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = React.useState(false);
  const [avatar, setAvatar] = React.useState(false);
  const [q, setQ] = React.useState("");
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) router.push(`/leads?q=${encodeURIComponent(q.trim())}`);
  }
  const initial = (ownerName || "A").trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* logo */}
        <Link href="/" className="flex shrink-0 items-center">
          <BrandLockup />
        </Link>

        {/* desktop pill nav */}
        <nav className="ml-2 hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:flex">
          {NAV.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-fg shadow-sm" : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}>
                <Icon className="size-4" /> {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2 lg:flex-none">
          {/* search */}
          <form onSubmit={search} className="relative hidden md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads…"
              className="h-10 w-44 rounded-full border border-border bg-surface-2 pl-9 pr-3 text-sm outline-none transition-[width,box-shadow] focus:w-64 focus:ring-2 focus:ring-ring/40 lg:w-56" />
          </form>

          {paused && <span className="hidden items-center gap-1 rounded-full bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger sm:inline-flex">● Paused</span>}

          <ThemeToggle />

          <Link href="/inbox" className="relative flex size-10 items-center justify-center rounded-full border border-border text-muted transition-colors hover:bg-surface-2 hover:text-foreground" title="Inbox">
            <Bell className="size-4" />
          </Link>

          {/* avatar menu */}
          <div className="relative">
            <button onClick={() => setAvatar((v) => !v)} className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-fg" title={ownerName}>
              {initial}
            </button>
            {avatar && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAvatar(false)} />
                <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-medium">{ownerName}</p>
                    <p className="text-xs text-muted">Owner</p>
                  </div>
                  <Link href="/settings/security" onClick={() => setAvatar(false)} className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground">Account & security</Link>
                  <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-soft">
                    <LogOut className="size-4" /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>

          {/* mobile menu toggle */}
          <button onClick={() => setMenu((v) => !v)} className="flex size-10 items-center justify-center rounded-full border border-border text-muted lg:hidden" aria-label="Menu">
            {menu ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* mobile nav panel */}
      {menu && (
        <nav className="border-t border-border bg-surface px-4 py-2 lg:hidden" onClick={() => setMenu(false)}>
          {NAV.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium", active ? "bg-accent-soft text-primary" : "text-muted hover:bg-surface-2")}>
                <Icon className="size-4" /> {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
