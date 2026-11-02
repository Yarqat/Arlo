// Generates SVG "product screenshots" of the Arlo UI using the real design
// tokens, populated with illustrative sample data. Pure SVG (shapes + text) so
// GitHub renders them inline. Run: node scripts/gen-screens.mjs
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "screenshots");
mkdirSync(OUT, { recursive: true });

// ---- tokens (light theme) ----
const C = {
  bg: "#fafafa", surface: "#ffffff", surface2: "#f4f4f5", fg: "#18181b",
  muted: "#71717a", muted2: "#a1a1aa", border: "#e4e4e7", borderStrong: "#d4d4d8",
  primary: "#4338ca", primaryFg: "#ffffff", accentSoft: "#eef2ff",
  success: "#15803d", successSoft: "#dcfce7", warning: "#b45309", warningSoft: "#fef3c7",
  danger: "#b91c1c", dangerSoft: "#fee2e2", info: "#0369a1", infoSoft: "#e0f2fe",
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const W = 1440, H = 900, SB = 248;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n = (x) => x.toLocaleString("en-US");

function text(x, y, s, { size = 14, fill = C.fg, weight = 400, anchor = "start", opacity = 1 } = {}) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}">${esc(s)}</text>`;
}
function rect(x, y, w, h, { r = 10, fill = C.surface, stroke = C.border, sw = 1 } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${sw}"` : ""}/>`;
}
function pill(x, y, label, fill, textFill, w) {
  const width = w ?? (label.length * 7.0 + 20);
  return rect(x, y, width, 22, { r: 11, fill, stroke: "none" }) + text(x + width / 2, y + 15, label, { size: 11.5, fill: textFill, weight: 600, anchor: "middle" });
}

const NAV = ["Overview", "Assistant", "Leads", "Campaigns", "Inbox", "Reports", "Settings"];
function sidebar(active) {
  let s = rect(0, 0, SB, H, { r: 0, fill: C.surface, stroke: "none" });
  s += `<line x1="${SB}" y1="0" x2="${SB}" y2="${H}" stroke="${C.border}" stroke-width="1"/>`;
  // logo
  s += rect(20, 22, 32, 32, { r: 9, fill: C.primary, stroke: "none" }) + text(36, 44, "A", { size: 17, fill: "#fff", weight: 700, anchor: "middle" });
  s += text(62, 38, "Arlo", { size: 15, weight: 700 });
  s += text(62, 54, "Sales assistant", { size: 11.5, fill: C.muted });
  let y = 96;
  for (const item of NAV) {
    const on = item === active;
    if (on) s += rect(12, y - 18, SB - 24, 34, { r: 8, fill: C.accentSoft, stroke: "none" });
    s += rect(24, y - 11, 15, 15, { r: 4, fill: on ? C.primary : C.muted2, stroke: "none" });
    s += text(50, y + 1, item, { size: 13.5, fill: on ? C.primary : C.fg, weight: on ? 600 : 500 });
    y += 42;
  }
  // footer: pause control
  s += rect(12, H - 70, SB - 24, 44, { r: 8, fill: C.surface, stroke: C.borderStrong });
  s += `<circle cx="34" cy="${H - 48}" r="5" fill="${C.success}"/>`;
  s += text(50, H - 52, "All systems active", { size: 12, weight: 600 });
  s += text(50, H - 37, "Pause everything", { size: 11, fill: C.muted });
  return s;
}
function header(title, subtitle, right) {
  let s = text(SB + 32, 56, title, { size: 24, weight: 700 });
  if (subtitle) s += text(SB + 32, 80, subtitle, { size: 14, fill: C.muted });
  if (right) {
    s += rect(W - 32 - 150, 40, 150, 34, { r: 8, fill: C.surface, stroke: C.borderStrong });
    s += `<circle cx="${W - 32 - 150 + 20}" cy="57" r="4" fill="${C.success}"/>`;
    s += text(W - 32 - 150 + 34, 61, right, { size: 12.5, fill: C.fg, weight: 500 });
  }
  return s;
}
function frame(active, title, subtitle, content, right = "Live") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<rect width="${W}" height="${H}" fill="${C.bg}"/>
${sidebar(active)}
${header(title, subtitle, right)}
${content}
</svg>`;
}
const CX = SB + 32; // content left
const CW = W - SB - 64; // content width

// ---------- 1) Overview ----------
function overview() {
  let s = "";
  const kpis = [
    ["Total leads", "1,284", "+96 this week", C.primary],
    ["Contacted", "946", "73.7% of leads", C.info],
    ["Replies", "212", "22.4% reply rate", C.success],
    ["Interested", "38", "+7 this week", C.warning],
  ];
  const gap = 20, cw = (CW - gap * 3) / 4;
  kpis.forEach(([label, val, sub, col], i) => {
    const x = CX + i * (cw + gap), y = 108;
    s += rect(x, y, cw, 110);
    s += rect(x + 20, y + 22, 8, 8, { r: 2, fill: col, stroke: "none" });
    s += text(x + 38, y + 30, label, { size: 13, fill: C.muted, weight: 500 });
    s += text(x + 20, y + 72, val, { size: 34, weight: 700 });
    s += text(x + 20, y + 95, sub, { size: 12, fill: C.muted });
  });
  // Pipeline funnel
  const fy = 250;
  s += rect(CX, fy, CW * 0.62, 352);
  s += text(CX + 24, fy + 34, "Pipeline", { size: 16, weight: 700 });
  s += text(CX + 24, fy + 54, "Where your leads are right now", { size: 12.5, fill: C.muted });
  const stages = [
    ["New", 1284, C.muted2], ["Qualified", 611, C.info], ["Contacted", 946, C.primary],
    ["Replied", 212, C.success], ["Interested", 38, C.warning], ["Meeting booked", 11, C.primary], ["Won", 9, C.success],
  ];
  const maxv = 1284, barX = CX + 150, barMaxW = CW * 0.62 - 150 - 90;
  stages.forEach(([label, val, col], i) => {
    const y = fy + 86 + i * 36;
    s += text(CX + 24, y + 13, label, { size: 12.5, fill: C.fg, weight: 500 });
    s += rect(barX, y, Math.max(8, (val / maxv) * barMaxW), 18, { r: 5, fill: col, stroke: "none" });
    s += text(barX + Math.max(8, (val / maxv) * barMaxW) + 10, y + 13, n(val), { size: 12, fill: C.muted, weight: 600 });
  });
  // Recent activity
  const rx = CX + CW * 0.62 + 20, rw = CW * 0.38 - 20;
  s += rect(rx, fy, rw, 352);
  s += text(rx + 20, fy + 34, "Recent activity", { size: 16, weight: 700 });
  const acts = [
    ["Reply", "Oahu Hood Cleaning replied — interested", C.success],
    ["Sent", "Draft approved → sent to Pacific Pumping", C.primary],
    ["Verified", "17 contacts deliverable", C.info],
    ["Discovery", "26 new leads found (USA, AU)", C.primary],
    ["Reply", "Hydra-Air Pacific — not interested", C.muted],
    ["Research", "Island Calibration Labs qualified", C.warning],
  ];
  acts.forEach(([tag, body, col], i) => {
    const y = fy + 70 + i * 46;
    s += `<circle cx="${rx + 24}" cy="${y + 10}" r="4" fill="${col}"/>`;
    s += text(rx + 40, y + 6, tag, { size: 11.5, fill: col, weight: 700 });
    s += text(rx + 40, y + 24, body.length > 36 ? body.slice(0, 35) + "…" : body, { size: 12, fill: C.fg });
  });
  return frame("Overview", "Overview", "Your pipeline at a glance — sample data", s, "Live");
}

// ---------- 2) Assistant (Arlo voice) ----------
function assistant() {
  let s = "";
  const px = CX, pw = CW, py = 108, ph = 640;
  s += rect(px, py, pw, ph);
  // toolbar
  s += rect(px + 20, py + 18, 34, 34, { r: 9, fill: C.accentSoft, stroke: "none" }) + text(px + 37, py + 40, "✦", { size: 16, fill: C.primary, anchor: "middle" });
  s += text(px + 66, py + 33, "Arlo", { size: 15, weight: 700 });
  s += `<circle cx="${px + 110}" cy="${py + 36}" r="4" fill="${C.danger}"/>`;
  s += text(px + 122, py + 40, "Listening…", { size: 12, fill: C.muted });
  // speak toggle
  s += text(px + pw - 150, py + 40, "Speak replies", { size: 12, fill: C.muted });
  s += rect(px + pw - 54, py + 28, 34, 18, { r: 9, fill: C.primary, stroke: "none" }) + `<circle cx="${px + pw - 28}" cy="${py + 37}" r="7" fill="#fff"/>`;
  s += `<line x1="${px}" y1="${py + 64}" x2="${px + pw}" y2="${py + 64}" stroke="${C.border}"/>`;
  // messages
  const msgs = [
    ["user", "Summarise my inbox and tell me who's worth a follow-up."],
    ["arlo", "4 new replies. Oahu Hood Cleaning is interested — asked about scheduling. Pacific Pumping wants a callback Tue. Two are soft 'not now'. I'd prioritise Oahu and Pacific."],
    ["user", "Remind me to follow up with Oahu Hood Cleaning tomorrow 15:00."],
    ["arlo", "Remind you — \"Follow up with Oahu Hood Cleaning\" at Wed 3 Dec 2025, 15:00 PKT. Shall I go ahead?"],
  ];
  let y = py + 92;
  for (const [role, body] of msgs) {
    const lines = wrap(body, role === "user" ? 54 : 66);
    const bw = role === "user" ? 440 : 560, bh = lines.length * 20 + 20;
    const bx = role === "user" ? px + pw - 20 - bw : px + 20;
    s += rect(bx, y, bw, bh, { r: 10, fill: role === "user" ? C.primary : C.surface2, stroke: "none" });
    lines.forEach((ln, i) => s += text(bx + 16, y + 24 + i * 20, ln, { size: 13, fill: role === "user" ? "#fff" : C.fg }));
    y += bh + 14;
  }
  // confirm buttons under last arlo msg
  s += rect(px + 20, y, 104, 34, { r: 8, fill: C.primary, stroke: "none" }) + text(px + 72, y + 22, "✓ Confirm", { size: 13, fill: "#fff", weight: 600, anchor: "middle" });
  s += rect(px + 134, y, 92, 34, { r: 8, fill: C.surface, stroke: C.borderStrong }) + text(px + 180, y + 22, "Cancel", { size: 13, fill: C.fg, anchor: "middle" });
  // input bar
  const iy = py + ph - 64;
  s += rect(px + 20, iy, 44, 44, { r: 10, fill: C.primary, stroke: "none" }) + text(px + 42, iy + 28, "●", { size: 16, fill: "#fff", anchor: "middle" });
  s += rect(px + 72, iy, pw - 72 - 20 - 54, 44, { r: 10, fill: C.surface, stroke: C.borderStrong }) + text(px + 90, iy + 28, "Message Arlo, or hold the mic…", { size: 13, fill: C.muted2 });
  s += rect(px + pw - 20 - 44, iy, 44, 44, { r: 10, fill: C.primary, stroke: "none" }) + text(px + pw - 20 - 22, iy + 28, "➤", { size: 15, fill: "#fff", anchor: "middle" });
  return frame("Assistant", "Assistant", "Talk or type — same budgets, suppression and confirmation rules", s, "Voice on");
}
function wrap(str, max) {
  const words = str.split(" "); const lines = []; let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > max) { lines.push(cur.trim()); cur = w; } else cur += " " + w; }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

// ---------- 3) Leads ----------
function leads() {
  let s = "";
  // toolbar
  s += rect(CX, 104, 360, 38, { r: 8, fill: C.surface, stroke: C.borderStrong }) + text(CX + 16, 128, "Search 1,284 leads…", { size: 13, fill: C.muted2 });
  s += rect(W - 32 - 120, 104, 120, 38, { r: 8, fill: C.primary, stroke: "none" }) + text(W - 32 - 60, 128, "Import CSV", { size: 13, fill: "#fff", weight: 600, anchor: "middle" });
  // table
  const tx = CX, ty = 162, tw = CW;
  s += rect(tx, ty, tw, 580);
  const cols = [[40, "Business"], [430, "Location"], [640, "Stage"], [860, "Verification"], [1090, "Updated"]];
  cols.forEach(([dx, label]) => s += text(tx + dx, ty + 34, label, { size: 12, fill: C.muted, weight: 600 }));
  s += `<line x1="${tx}" y1="${ty + 48}" x2="${tx + tw}" y2="${ty + 48}" stroke="${C.border}"/>`;
  const rows = [
    ["Oahu Hood Cleaning", "oahuhoodcleaning.com", "Honolulu, US", "Interested", "warning", "Deliverable", "success", "2m ago"],
    ["Pacific Pumping & Septic", "pacificpumping.com", "San Diego, US", "Replied", "success", "Deliverable", "success", "14m ago"],
    ["Hydra-Air Pacific", "hydraairpacific.com", "Auckland, NZ", "Contacted", "info", "Catch-all", "warning", "1h ago"],
    ["Island Calibration Labs", "islandcalibration.com", "Brisbane, AU", "Qualified", "info", "Pending", "info", "1h ago"],
    ["MetroVac Exhaust Co.", "metrovacexhaust.com", "Austin, US", "Contacted", "info", "Deliverable", "success", "3h ago"],
    ["Northgate Septic Ltd", "northgateseptic.co.uk", "Leeds, UK", "Replied", "success", "Deliverable", "success", "4h ago"],
    ["ProHose Mobile Repair", "prohosemobile.com", "Calgary, CA", "New", "muted", "Pending", "info", "5h ago"],
    ["Summit Floor Coatings", "summitcoatings.com", "Denver, US", "Won", "success", "Deliverable", "success", "6h ago"],
    ["CleanVent Commercial", "cleanvent.com.au", "Perth, AU", "Not interested", "muted", "Deliverable", "success", "8h ago"],
    ["Apex Kitchen Exhaust", "apexexhaust.co.uk", "Manchester, UK", "Contacted", "info", "Deliverable", "success", "9h ago"],
  ];
  const toneMap = { success: [C.successSoft, C.success], warning: [C.warningSoft, C.warning], info: [C.infoSoft, C.info], muted: [C.surface2, C.muted] };
  rows.forEach((r, i) => {
    const y = ty + 48 + 12 + i * 50;
    s += text(tx + 40, y + 20, r[0], { size: 13.5, fill: C.fg, weight: 600 });
    s += text(tx + 40, y + 37, r[1], { size: 11.5, fill: C.muted });
    s += text(tx + 430, y + 28, r[2], { size: 12.5, fill: C.fg });
    const [sb, sf] = toneMap[r[4]]; s += pill(tx + 640, y + 13, r[3], sb, sf);
    const [vb, vf] = toneMap[r[6]]; s += pill(tx + 860, y + 13, r[5], vb, vf);
    s += text(tx + 1090, y + 28, r[7], { size: 12, fill: C.muted });
    if (i < rows.length - 1) s += `<line x1="${tx + 24}" y1="${y + 50}" x2="${tx + tw - 24}" y2="${y + 50}" stroke="${C.border}"/>`;
  });
  return frame("Leads", "Leads", "One business = one lead — deduped by domain · sample data", s, "1,284 leads");
}

// ---------- Inbox ----------
function inbox() {
  let s = "";
  // Tab row (with live counts) — mirrors the real filtered views.
  const tabs = [["All", null], ["Replies", 12], ["Sent", 288], ["Needs attention", 3], ["Interested", 7], ["Bounces", null], ["Unsubscribes", 21]];
  let tx = CX;
  const ty = 110;
  tabs.forEach(([label, count], i) => {
    const on = i === 1; // Replies active
    const w = label.length * 7.2 + (count != null ? 30 : 0) + 26;
    s += rect(tx, ty, w, 34, { r: 9, fill: on ? C.primary : C.surface, stroke: on ? "none" : C.border });
    s += text(tx + 14, ty + 22, label, { size: 12.5, fill: on ? "#fff" : C.fg, weight: on ? 600 : 500 });
    if (count != null) s += text(tx + w - 14, ty + 22, n(count), { size: 11.5, fill: on ? "#dfe3ff" : C.muted, weight: 600, anchor: "end" });
    tx += w + 8;
  });
  // Thread list
  const ly = 162, lw = CW;
  s += rect(CX, ly, lw, 578, { r: 10 });
  const threads = [
    ["Re: A quick note about your exhaust-cleaning enquiry form", "Oahu Hood Cleaning", "Yes — interested. Could you send a couple of times this week?", "interested", "success", "2m"],
    ["Re: Two ideas for your Austin service pages", "MetroVac Exhaust Co.", "This looks useful. What would something like this cost?", "needs attention", "warning", "20m"],
    ["Re: Making it easier to book a septic pump-out online", "Pacific Pumping & Septic", "Can we talk Tuesday afternoon? Happy to jump on a quick call.", "interested", "success", "1h"],
    ["Automatic reply: Out of office", "Northgate Septic Ltd", "I'm away until Monday with limited access to email…", "out of office", "info", "2h"],
    ["Please remove me", "CleanVent Commercial", "Not relevant for us — please unsubscribe me from this list.", "unsubscribe", "muted", "3h"],
    ["Mail delivery failed: returning message to sender", "mailer-daemon", "550 5.1.1 recipient address rejected: user unknown", "bounce", "danger", "5h"],
  ];
  const toneMap = { success: [C.successSoft, C.success], warning: [C.warningSoft, C.warning], info: [C.infoSoft, C.info], muted: [C.surface2, C.muted], danger: [C.dangerSoft, C.danger] };
  threads.forEach((t, i) => {
    const y = ly + 18 + i * 93;
    s += text(CX + 24, y + 24, t[0].length > 68 ? t[0].slice(0, 67) + "…" : t[0], { size: 14, fill: C.fg, weight: 600 });
    const [lb, lf] = toneMap[t[4]];
    s += pill(CX + 24, y + 38, t[3], lb, lf);
    s += text(CX + 24, y + 74, t[1] + " — " + t[2], { size: 12.5, fill: C.muted });
    s += text(CX + lw - 24, y + 24, t[5], { size: 12, fill: C.muted2, anchor: "end" });
    if (i < threads.length - 1) s += `<line x1="${CX + 24}" y1="${y + 86}" x2="${CX + lw - 24}" y2="${y + 86}" stroke="${C.border}"/>`;
  });
  return frame("Inbox", "Inbox", "Every conversation, matched to its lead — replies, bounces and opt-outs, each in its own view · sample data", s, "4 new");
}

// ---------- 4) Campaign detail ----------
function campaign() {
  let s = "";
  // header card
  s += rect(CX, 104, CW, 120);
  s += text(CX + 24, 140, "Commercial cleaning & industrial services — US/UK/CA/AU", { size: 18, weight: 700 });
  s += pill(CX + 24, 158, "Active", C.successSoft, C.success, 64);
  s += pill(CX + 96, 158, "Approve-first", C.infoSoft, C.info, 110);
  s += pill(CX + 214, 158, "A/B: 2 subjects", C.accentSoft, C.primary, 120);
  s += text(CX + 24, 206, "Nothing sends without your approval. Suppression, verification, budgets and schedule all enforced.", { size: 12.5, fill: C.muted });
  const stats = [["Leads", "412"], ["Verified", "286"], ["Drafts ready", "37"], ["Sent", "288"], ["Replies", "64"]];
  const gap = 20, cw = (CW - gap * 4) / 5;
  stats.forEach(([l, v], i) => { const x = CX + i * (cw + gap), y = 244; s += rect(x, y, cw, 96); s += text(x + 18, y + 60, v, { size: 30, weight: 700 }); s += text(x + 18, y + 82, l, { size: 12.5, fill: C.muted }); });
  // drafts review
  const dy = 364;
  s += rect(CX, dy, CW, 372);
  s += text(CX + 24, dy + 34, "Drafts awaiting your review", { size: 16, weight: 700 });
  s += pill(CX + 270, dy + 18, "37 pending", C.warningSoft, C.warning, 86);
  const drafts = [
    ["Oahu Hood Cleaning", "A quick note about your exhaust-cleaning enquiry form"],
    ["MetroVac Exhaust Co.", "Two ideas for your Austin service pages"],
    ["Northgate Septic Ltd", "Making it easier to book a septic pump-out online"],
    ["Apex Kitchen Exhaust", "Your Manchester enquiries — one small fix"],
  ];
  drafts.forEach((d, i) => {
    const y = dy + 64 + i * 72;
    s += rect(CX + 20, y, CW - 40, 60, { r: 8, fill: C.surface2, stroke: "none" });
    s += text(CX + 38, y + 26, d[0], { size: 13.5, weight: 600 });
    s += text(CX + 38, y + 45, "“" + d[1] + "”", { size: 12.5, fill: C.muted });
    s += rect(CX + CW - 40 - 190, y + 14, 90, 32, { r: 7, fill: C.primary, stroke: "none" }) + text(CX + CW - 40 - 145, y + 34, "Approve", { size: 12.5, fill: "#fff", weight: 600, anchor: "middle" });
    s += rect(CX + CW - 40 - 92, y + 14, 72, 32, { r: 7, fill: C.surface, stroke: C.borderStrong }) + text(CX + CW - 40 - 56, y + 34, "Edit", { size: 12.5, fill: C.fg, anchor: "middle" });
  });
  return frame("Campaigns", "Campaign", "Discover → research → verify → draft → approve → send · sample data", s, "Active");
}

// ---------- 5) Reports ----------
function reports() {
  let s = "";
  const kpis = [["Emails sent", "2,884", "confirmed accepted"], ["Reply rate", "22.4%", "646 / 2,884"], ["Link clicks", "312", "from 1,120 emails"], ["Meetings booked", "41", "from 7 campaigns"]];
  const gap = 20, cw = (CW - gap * 3) / 4;
  kpis.forEach(([l, v, sub], i) => { const x = CX + i * (cw + gap), y = 108; s += rect(x, y, cw, 104); s += text(x + 20, y + 34, l, { size: 13, fill: C.muted, weight: 500 }); s += text(x + 20, y + 74, v, { size: 30, weight: 700 }); s += text(x + 20, y + 94, sub, { size: 11.5, fill: C.muted }); });
  // bar chart: sends & replies over 8 weeks
  const chy = 250;
  s += rect(CX, chy, CW, 360);
  s += text(CX + 24, chy + 34, "Sends and replies by week", { size: 16, weight: 700 });
  s += `<rect x="${CX + CW - 220}" y="${chy + 20}" width="12" height="12" rx="3" fill="${C.primary}"/>` + text(CX + CW - 202, chy + 30, "Sent", { size: 12, fill: C.muted });
  s += `<rect x="${CX + CW - 150}" y="${chy + 20}" width="12" height="12" rx="3" fill="${C.success}"/>` + text(CX + CW - 132, chy + 30, "Replies", { size: 12, fill: C.muted });
  const data = [[280, 58], [312, 66], [356, 71], [404, 92], [372, 84], [420, 101], [388, 96], [352, 78]];
  const base = chy + 320, maxv = 440, chartW = CW - 80, bw = 34, step = chartW / data.length;
  data.forEach(([sent, rep], i) => {
    const x = CX + 50 + i * step;
    const sh = (sent / maxv) * 220, rh = (rep / maxv) * 220;
    s += rect(x, base - sh, bw, sh, { r: 4, fill: C.primary, stroke: "none" });
    s += rect(x + bw + 6, base - rh, bw, rh, { r: 4, fill: C.success, stroke: "none" });
    s += text(x + bw, base + 20, "W" + (i + 1), { size: 11.5, fill: C.muted, anchor: "middle" });
  });
  s += text(CX + 24, chy + 352, "Click tracking only — no open pixels, no fabricated metrics. Delivery is counted only when a provider confirms it.", { size: 11.5, fill: C.muted2 });
  return frame("Reports", "Reports", "Honest metrics, explicitly defined · sample data", s, "Last 8 weeks");
}

const files = { "overview": overview(), "assistant": assistant(), "leads": leads(), "inbox": inbox(), "campaign": campaign(), "reports": reports() };
for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(OUT, name + ".svg"), svg);
  console.log("wrote", name + ".svg");
}
