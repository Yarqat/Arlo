"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";

export function UnsubscribeClient({ token, email }: { token: string; email: string }) {
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    setBusy(true);
    await fetch("/api/public/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setBusy(false);
    setDone(true);
  }

  if (done) {
    return (
      <>
        <h1 className="text-lg font-semibold">You're unsubscribed</h1>
        <p className="mt-2 text-sm text-muted">{email} will not receive further emails from Yarqat.</p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-lg font-semibold">Unsubscribe</h1>
      <p className="mt-2 text-sm text-muted">Stop receiving emails from Yarqat at <b>{email}</b>?</p>
      <Button className="mt-4 w-full" onClick={confirm} disabled={busy}>
        {busy ? "Processing…" : "Confirm unsubscribe"}
      </Button>
    </>
  );
}
