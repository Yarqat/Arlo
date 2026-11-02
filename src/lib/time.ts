// Reporting day/time helpers in a configurable timezone (default Asia/Karachi).

export function dayKey(tz: string, d: Date = new Date()): string {
  // en-CA locale yields YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function monthKey(tz: string, d: Date = new Date()): string {
  return dayKey(tz, d).slice(0, 7); // YYYY-MM
}

export function hourInTz(tz: string, d: Date = new Date()): number {
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(d);
  return parseInt(s, 10) % 24;
}

export function weekdayInTz(tz: string, d: Date = new Date()): number {
  // 1 = Monday ... 7 = Sunday
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd] ?? 1;
}

export function fmtDateTime(d: Date | string | null | undefined, tz = "Asia/Karachi"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function partsInTz(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== "literal") o[p.type] = parseInt(p.value, 10);
  return o;
}

/**
 * Interpret wall-clock components as a time IN `tz` and return the corresponding
 * UTC instant. Iterates to settle DST/offset. Used so "tomorrow 9am" entered by
 * the owner means 9am in Asia/Karachi, stored as a correct absolute instant.
 */
export function zonedWallToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let utc = target;
  for (let i = 0; i < 4; i++) {
    const p = partsInTz(new Date(utc), tz);
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second || 0);
    utc = target - (asIfUtc - utc);
  }
  return new Date(utc);
}

/** Parse "YYYY-MM-DD HH:mm" (or with 'T') as wall time in tz → UTC instant. */
export function parseLocalDateTime(local: string, tz: string): Date | null {
  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const d = zonedWallToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tz);
  return isNaN(d.getTime()) ? null : d;
}

/** Full, human date+time in tz, e.g. "Mon 3 Nov 2025, 09:00 PKT". */
export function fmtFull(d: Date | string, tz = "Asia/Karachi"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short",
  }).format(date);
}

/** Current wall-clock in tz as "YYYY-MM-DD HH:mm" plus weekday, for prompting. */
export function nowLocalString(tz: string): string {
  const p = partsInTz(new Date(), tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  const wd = weekdayInTz(tz);
  const names = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour === 24 ? 0 : p.hour)}:${pad(p.minute)} (${names[wd]})`;
}

export function relativeTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDateTime(date);
}
