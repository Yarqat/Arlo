"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SettingsBack({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
        <ArrowLeft className="size-3" /> Settings
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="text-sm text-muted">{description}</p>}
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function useSave(endpoint: string, method: "POST" | "PATCH" | "PUT" = "POST") {
  const router = useRouter();
  const [state, setState] = React.useState<SaveState>("idle");
  const [error, setError] = React.useState("");

  async function save(body: unknown): Promise<unknown | null> {
    setState("saving");
    setError("");
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setError(data.error || "Save failed");
        return null;
      }
      setState("saved");
      setTimeout(() => setState("idle"), 2000);
      router.refresh();
      return data;
    } catch {
      setState("error");
      setError("Network error");
      return null;
    }
  }

  return { save, state, error };
}

export function SaveButton({ state, children }: { state: SaveState; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" disabled={state === "saving"}>
        {state === "saving" ? "Saving…" : children ?? "Save changes"}
      </Button>
      {state === "saved" && <span className="text-sm text-success">Saved</span>}
      {state === "error" && <span className="text-sm text-danger">Error</span>}
    </div>
  );
}
