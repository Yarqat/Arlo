"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pause, Play } from "lucide-react";

export function PauseControl({ paused }: { paused: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function toggle() {
    setLoading(true);
    await fetch("/api/settings/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: !paused }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button variant={paused ? "primary" : "danger"} onClick={toggle} disabled={loading}>
      {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
      {paused ? "Resume outbound" : "Pause everything"}
    </Button>
  );
}
