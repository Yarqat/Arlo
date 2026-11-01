"use client";
import * as React from "react";
import { Input, Textarea, Field } from "@/components/ui/input";
import { useSave, SaveButton } from "../settings-ui";

type P = {
  companyName: string;
  personName: string;
  roleTitle: string;
  bio: string;
  website: string;
  defaultSignature: string;
  timezone: string;
};

export function ProfileForm({ initial }: { initial: P }) {
  const { save, state, error } = useSave("/api/settings/profile");
  const [p, setP] = React.useState(initial);
  const set = (k: keyof P) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setP({ ...p, [k]: e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(p);
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name"><Input value={p.personName} onChange={set("personName")} /></Field>
        <Field label="Role / title"><Input value={p.roleTitle} onChange={set("roleTitle")} placeholder="Founder, Yarqat" /></Field>
        <Field label="Company"><Input value={p.companyName} onChange={set("companyName")} /></Field>
        <Field label="Website"><Input value={p.website} onChange={set("website")} placeholder="https://yarqat.com" /></Field>
      </div>
      <Field label="Short bio" hint="Factual background the assistant may draw on. No invented claims.">
        <Textarea value={p.bio} onChange={set("bio")} rows={3} />
      </Field>
      <Field label="Email signature" hint="Appended to outgoing emails.">
        <Textarea value={p.defaultSignature} onChange={set("defaultSignature")} rows={3} placeholder={"Shah Fahad\nYarqat\nhttps://yarqat.com"} />
      </Field>
      <Field label="Reporting timezone"><Input value={p.timezone} onChange={set("timezone")} placeholder="Asia/Karachi" /></Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <SaveButton state={state} />
    </form>
  );
}
