"use client";
import * as React from "react";
import { Input, Field } from "@/components/ui/input";
import { useSave, SaveButton } from "../settings-ui";

export function SecurityForm() {
  const { save, state, error } = useSave("/api/settings/password");
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [localErr, setLocalErr] = React.useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr("");
    if (next.length < 10) return setLocalErr("New password must be at least 10 characters.");
    if (next !== confirm) return setLocalErr("Passwords do not match.");
    const ok = await save({ current, next });
    if (ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-4">
      <Field label="Current password">
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </Field>
      <Field label="New password" hint="At least 10 characters.">
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password">
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      </Field>
      {(localErr || error) && <p className="text-sm text-danger">{localErr || error}</p>}
      <SaveButton state={state}>Update password</SaveButton>
    </form>
  );
}
