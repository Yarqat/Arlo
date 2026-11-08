"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Globe, Check } from "lucide-react";

type Learned = {
  summary: string;
  voice: string;
  services: { name: string; description: string }[];
  valueProps: string[];
  pagesRead: number;
  via: string;
};

export function LearnBrand({ initialWebsite }: { initialWebsite: string }) {
  const router = useRouter();
  const [url, setUrl] = React.useState(initialWebsite || "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<Learned | null>(null);

  async function learn() {
    if (!url.trim()) { setError("Enter your website address first."); return; }
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/profile/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read that website.");
      setResult(data.brand as Learned);
      router.refresh(); // pull the updated bio / voice / services into the page
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/20 bg-accent-soft/40 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Learn from your website</p>
          <p className="mt-0.5 text-xs text-muted">
            Arlo reads your site and fills in your summary, services and brand voice — so every email offers what you
            actually do, in your tone, instead of a generic pitch.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Globe className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-2" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourbusiness.com"
                className="pl-8"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); learn(); } }}
              />
            </div>
            <Button onClick={learn} disabled={busy} className="shrink-0">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? "Reading your site…" : "Learn my brand"}
            </Button>
          </div>

          {error && <p className="mt-2 text-sm text-danger">{error}</p>}

          {result && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-success">
                <Check className="size-4" /> Saved to your profile · read {result.pagesRead} page{result.pagesRead === 1 ? "" : "s"}
                {result.via !== "fetch" && <Badge tone="neutral">JS-rendered</Badge>}
              </div>
              {result.summary && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Your business</p>
                  <p className="mt-0.5 text-sm text-foreground/80">{result.summary}</p>
                </div>
              )}
              {result.voice && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Brand voice</p>
                  <p className="mt-0.5 text-sm text-foreground/80">{result.voice}</p>
                </div>
              )}
              {result.services.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Services found</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {result.services.map((s) => (
                      <Badge key={s.name} tone="info" title={s.description}>{s.name}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-2">Review the fields below and edit anything that isn’t quite right.</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
