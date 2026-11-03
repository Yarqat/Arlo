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
  offer: string;
  requiredContactFields: string[];
  maxNewLeadsPerDay: number;
  kind: string;
  targetRole: string;
  jobPostMaxAgeDays: number | null;
};

const EMPTY: Brief = {
  name: "", businessType: "", countries: [], cities: [], language: "English",
  servicesOffered: [], positiveCriteria: "", exclusions: "", offer: "", requiredContactFields: ["email"], maxNewLeadsPerDay: 20,
  kind: "SALES", targetRole: "", jobPostMaxAgeDays: null,
};

async function post(body: unknown) {
  const res = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

export function BriefEditor() {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [brief, setBrief] = React.useState<Brief | null>(null);
  // Comma-separated fields are edited as raw text so commas/spaces survive
  // typing; they're split into arrays only on submit.
  const [raw, setRaw] = React.useState<Record<string, string>>({});
  const [parsing, setParsing] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [cvName, setCvName] = React.useState("");
  const [cvBusy, setCvBusy] = React.useState(false);

  async function uploadCv(file: File) {
    setCvBusy(true);
    const fd = new FormData();
    fd.set("cv", file);
    const res = await fetch("/api/settings/cv", { method: "POST", body: fd });
    const d = await res.json().catch(() => ({}));
    setCvBusy(false);
    if (res.ok) setCvName(d.name || file.name);
    else setNote(d.error || "CV upload failed");
  }

  async function parse() {
    if (text.trim().length < 3) return;
    setParsing(true);
    setNote("");
    const r = await post({ action: "parse", text });
    setParsing(false);
    if (r.brief) {
      const b = { ...EMPTY, ...r.brief };
      setBrief(b);
      setRaw({
        countries: (b.countries ?? []).join(", "),
        cities: (b.cities ?? []).join(", "),
        servicesOffered: (b.servicesOffered ?? []).join(", "),
        requiredContactFields: (b.requiredContactFields ?? ["email"]).join(", "),
      });
      setNote(r.ai ? "Parsed with the assistant. Review and edit before creating." : "No AI model assigned yet, so this is a basic parse — edit the fields below.");
    }
  }

  const toArr = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function create() {
    if (!brief) return;
    setCreating(true);
    const payload = {
      ...brief,
      countries: toArr(raw.countries ?? ""),
      cities: toArr(raw.cities ?? ""),
      servicesOffered: toArr(raw.servicesOffered ?? ""),
      requiredContactFields: toArr(raw.requiredContactFields ?? "email"),
    };
    const r = await post({ action: "create", ...payload, briefRaw: text });
    setCreating(false);
    if (r.id) router.push(`/campaigns/${r.id}`);
  }

  const setRawField = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setRaw((r) => ({ ...r, [k]: e.target.value }));
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
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={brief.kind === "JOB_SEARCH"}
                onChange={(e) => setBrief((b) => (b ? { ...b, kind: e.target.checked ? "JOB_SEARCH" : "SALES" } : b))}
              />
              Job-search mode — pitch a candidate to companies hiring for a role
            </label>
            {brief.kind === "JOB_SEARCH" && (
              <div className="grid gap-4 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-2">
                <Field label="Target role"><Input value={brief.targetRole} onChange={setStr("targetRole")} placeholder="e.g. Senior React Developer" /></Field>
                <Field label="Only postings newer than (days, optional)">
                  <Input type="number" value={brief.jobPostMaxAgeDays ?? ""} onChange={(e) => setBrief((b) => (b ? { ...b, jobPostMaxAgeDays: e.target.value ? Number(e.target.value) : null } : b))} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Your CV — attached to every email (PDF or Word)">
                    <input
                      type="file"
                      accept="application/pdf,.doc,.docx"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCv(f); }}
                      className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:text-foreground"
                    />
                  </Field>
                  {cvBusy ? <p className="mt-1 text-xs text-muted">Uploading…</p>
                    : cvName ? <p className="mt-1 text-xs text-success">CV uploaded: {cvName}</p>
                    : <p className="mt-1 text-xs text-muted">No CV uploaded yet.</p>}
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Campaign name"><Input value={brief.name} onChange={setStr("name")} /></Field>
              <Field label="Business type / niche"><Input value={brief.businessType} onChange={setStr("businessType")} /></Field>
              <Field label="Countries (comma separated)"><Input value={raw.countries ?? ""} onChange={setRawField("countries")} placeholder="usa, uk, canada, australia" /></Field>
              <Field label="Cities (comma separated)"><Input value={raw.cities ?? ""} onChange={setRawField("cities")} /></Field>
              <Field label="Language"><Input value={brief.language} onChange={setStr("language")} /></Field>
              <Field label="Services to offer (comma separated)"><Input value={raw.servicesOffered ?? ""} onChange={setRawField("servicesOffered")} /></Field>
            </div>
            <Field label="Your offer — what every email pitches">
              <Textarea value={brief.offer} onChange={setStr("offer")} rows={2} placeholder="e.g. A faster, modern website with an online enquiry/quote form so more customers get in touch. Open by asking who currently looks after their website." />
            </Field>
            <Field label="Positive qualification criteria"><Textarea value={brief.positiveCriteria} onChange={setStr("positiveCriteria")} rows={2} /></Field>
            <Field label="Exclusions"><Textarea value={brief.exclusions} onChange={setStr("exclusions")} rows={2} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Required contact fields"><Input value={raw.requiredContactFields ?? ""} onChange={setRawField("requiredContactFields")} /></Field>
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
