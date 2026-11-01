"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";

export function SuppressionManager({ query }: { query: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [q, setQ] = React.useState(query);
  const [busy, setBusy] = React.useState(false);

  async function add() {
    if (!email.includes("@")) return;
    setBusy(true);
    await fetch("/api/suppression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", email }),
    });
    setEmail("");
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-end gap-2">
        <div className="w-64">
          <Input placeholder="address@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="button" onClick={add} disabled={busy}><Plus className="size-4" /> Suppress</Button>
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/settings/suppression${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        }}
      >
        <div className="w-56">
          <Input placeholder="Search list…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary"><Search className="size-4" /></Button>
      </form>
    </div>
  );
}
