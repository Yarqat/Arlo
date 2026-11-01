"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Sparkles } from "lucide-react";

const EXAMPLES = [
  "Find independent churches in the UK with outdated websites and published business emails.",
  "Find plumbing companies in Dubai with poor mobile websites.",
  "Find small law firms in Manchester that could benefit from a redesign or an enquiry form.",
];

type Brief = {
  name: string;
  businessType: string;
  countries: string[];
  cities: string[];
  language: string;
  servicesOffered: string[];
  positiveCriteria: string;
  exclusions: string;
  requiredContactFields: string[];
  maxNewLeadsPerDay: number;
};

const EMPTY: Brief = {
  name: "", businessType: "", countries: [], cities: [], language: "English",
  servicesOffered: [], positiveCriteria: "", exclusions: "", requiredContactFields: ["email"], maxNewLeadsPerDay: 20,
};

async function post(body: unknown) {
  const res = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

export function BriefEditor() {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [brief, setBrief] = React.useState<Brief | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [note, setNote] = React.useState("");

  async function parse() {
    if (text.trim().length < 3) return;
    setParsing(true);
    setNote("");
    const r = await post({ action: "parse", text });
    setParsing(false);
    if (r.brief) {
      setBrief({ ...EMPTY, ...r.brief });
      setNote(r.ai ? "Parsed with the assistant. Review and edit before creating." : "No AI model assigned yet, so this is a basic parse — edit the fields below.");
    }
  }

  async function create() {
    if (!brief) return;
    setCreating(true);
    const r = await post({ action: "create", ...brief, briefRaw: text });
    setCreating(false);
    if (r.id) router.push(`/campaigns/${r.id}`);
  }

  const arr = (k: keyof Brief) => (brief?.[k] as string[]).join(", ");
  const setArr = (k: keyof Brief) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setBrief((b) => (b ? { ...b, [k]: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : b));
  const setStr = (k: keyof Brief) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setBrief((b) => (b ? { ...b, [k]: e.target.value } : b));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Describe your ideal leads</CardTitle>
          <CardDescription>Plain English is fine — mention the business type, places, and what makes a good fit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={EXAMPLES[0]} />
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => setText(ex)} className="rounded-full border border-border-strong px-3 py-1 text-xs text-muted hover:bg-surface-2">
                {ex.slice(0, 48)}…
              </button>
            ))}
          </div>
          <Button onClick={parse} disabled={parsing || text.trim().length < 3}>
            <Sparkles className="size-4" /> {parsing ? "Parsing…" : "Turn into a brief"}
          </Button>
        </CardContent>
      </Card>

      {note && <Alert tone="info">{note}</Alert>}

      {brief && (
        <Card>
          <CardHeader><CardTitle>Campaign brief</CardTitle><CardDescription>Everything is editable.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Campaign name"><Input value={brief.name} onChange={setStr("name")} /></Field>
              <Field label="Business type / niche"><Input value={brief.businessType} onChange={setStr("businessType")} /></Field>
              <Field label="Countries (comma separated)"><Input value={arr("countries")} onChange={setArr("countries")} /></Field>
              <Field label="Cities (comma separated)"><Input value={arr("cities")} onChange={setArr("cities")} /></Field>
              <Field label="Language"><Input value={brief.language} onChange={setStr("language")} /></Field>
              <Field label="Services to offer (comma separated)"><Input value={arr("servicesOffered")} onChange={setArr("servicesOffered")} /></Field>
            </div>
            <Field label="Positive qualification criteria"><Textarea value={brief.positiveCriteria} onChange={setStr("positiveCriteria")} rows={2} /></Field>
            <Field label="Exclusions"><Textarea value={brief.exclusions} onChange={setStr("exclusions")} rows={2} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Required contact fields"><Input value={arr("requiredContactFields")} onChange={setArr("requiredContactFields")} /></Field>
              <Field label="Max new leads per day"><Input type="number" value={brief.maxNewLeadsPerDay} onChange={(e) => setBrief((b) => (b ? { ...b, maxNewLeadsPerDay: Number(e.target.value) } : b))} /></Field>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={create} disabled={creating}>{creating ? "Creating…" : "Create campaign"}</Button>
              <span className="text-xs text-muted">Starts in Draft-only mode. You enable sending later.</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
