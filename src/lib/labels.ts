// Human labels + badge tones for enums. Keep display strings in one place.

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

const STAGE: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "neutral" },
  RESEARCHING: { label: "Researching", tone: "info" },
  QUALIFIED: { label: "Qualified", tone: "primary" },
  READY_FOR_REVIEW: { label: "Ready for review", tone: "warning" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  CONTACTED: { label: "Contacted", tone: "primary" },
  REPLIED: { label: "Replied", tone: "info" },
  INTERESTED: { label: "Interested", tone: "success" },
  MEETING_REQUESTED: { label: "Meeting requested", tone: "success" },
  MEETING_BOOKED: { label: "Meeting booked", tone: "success" },
  PROPOSAL_NEEDED: { label: "Proposal needed", tone: "warning" },
  WON: { label: "Won", tone: "success" },
  LOST: { label: "Lost", tone: "neutral" },
  NOT_INTERESTED: { label: "Not interested", tone: "neutral" },
  SUPPRESSED: { label: "Suppressed", tone: "danger" },
};

export function stageLabel(s: string): string {
  return STAGE[s]?.label ?? s;
}
export function stageTone(s: string): Tone {
  return STAGE[s]?.tone ?? "neutral";
}

const VERIFY: Record<string, { label: string; tone: Tone }> = {
  DELIVERABLE: { label: "Deliverable", tone: "success" },
  INVALID: { label: "Invalid", tone: "danger" },
  CATCH_ALL: { label: "Catch-all", tone: "warning" },
  UNKNOWN: { label: "Unknown", tone: "warning" },
  DISPOSABLE: { label: "Disposable", tone: "danger" },
  ROLE: { label: "Role", tone: "info" },
  UNVERIFIED: { label: "Unverified", tone: "neutral" },
};
export function verifyLabel(s: string) {
  return VERIFY[s]?.label ?? s;
}
export function verifyTone(s: string): Tone {
  return VERIFY[s]?.tone ?? "neutral";
}

const REPLY: Record<string, { label: string; tone: Tone }> = {
  NONE: { label: "—", tone: "neutral" },
  INTERESTED: { label: "Interested", tone: "success" },
  INFO_REQUEST: { label: "Info request", tone: "info" },
  PRICING_REQUEST: { label: "Pricing request", tone: "warning" },
  MEETING_REQUEST: { label: "Meeting request", tone: "success" },
  HAS_PROVIDER: { label: "Has provider", tone: "neutral" },
  NOT_INTERESTED: { label: "Not interested", tone: "neutral" },
  UNSUBSCRIBE: { label: "Unsubscribe", tone: "danger" },
  OUT_OF_OFFICE: { label: "Out of office", tone: "info" },
  BOUNCE: { label: "Bounce", tone: "danger" },
  UNRELATED: { label: "Unrelated", tone: "neutral" },
  UNCERTAIN: { label: "Uncertain", tone: "warning" },
};
export function replyLabel(s: string) {
  return REPLY[s]?.label ?? s;
}
export function replyTone(s: string): Tone {
  return REPLY[s]?.tone ?? "neutral";
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
