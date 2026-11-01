"use client";
import * as React from "react";
import { Textarea, Field } from "@/components/ui/input";
import { useSave, SaveButton } from "../settings-ui";

export function WritingForm({ initial }: { initial: { writingPreferences: string; prohibitedClaims: string } }) {
  const { save, state, error } = useSave("/api/settings/profile");
  const [wp, setWp] = React.useState(initial.writingPreferences);
  const [pc, setPc] = React.useState(initial.prohibitedClaims);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save({ writingPreferences: wp, prohibitedClaims: pc });
      }}
      className="space-y-4"
    >
      <Field label="Writing preferences" hint="Tone, length, what to avoid. e.g. concise, no buzzwords, one evidenced point, simple question.">
        <Textarea value={wp} onChange={(e) => setWp(e.target.value)} rows={5} />
      </Field>
      <Field label="Prohibited claims" hint="Hard rules the assistant must never break.">
        <Textarea value={pc} onChange={(e) => setPc(e.target.value)} rows={5} />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <SaveButton state={state} />
    </form>
  );
}
