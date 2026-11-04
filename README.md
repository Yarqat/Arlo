<div align="center">

# Arlo

### Your self-hosted AI sales assistant — it finds leads, writes honest outreach, and never oversteps.

Arlo is a single-owner **AI sales CRM + cold-outreach assistant** you run on your own server. It discovers businesses, researches them from public data, **finds their contact emails**, verifies addresses, and drafts outreach in *your* voice — then, only when you approve, sends, follows up, and handles the replies. It tracks link clicks (never opens), alerts you the moment a hot reply lands, and offers *your* calendar link so prospects can book. You can run the whole thing **by voice or by text**.

The core idea: **the AI proposes, deterministic code enforces.** Suppression, budgets, idempotency, verification and send-eligibility are real database rows and hard checks — not prompt promises. Arlo will not invent a price, a testimonial, a guarantee or a result, and it treats every scraped page and inbound email as untrusted data.

[Features](#features) · [Screenshots](#screenshots) · [Quick start](#quick-start) · [Voice](#arlo-voice) · [Providers](#providers) · [Safety](#safety--guardrails) · [Architecture](#architecture)

`Next.js 16` · `React 19` · `TypeScript` · `Tailwind 4` · `Prisma + PostgreSQL` · `BullMQ + Redis` · `MIT`

</div>

> **Note on screenshots:** these are real captures of the running app. Contact email addresses are masked and message bodies blurred to protect third parties; aggregate numbers and the interface are genuine. A fresh install starts empty.

---

## Screenshots

### The interface — light & dark, built to be easy
Real screenshots of the live app: a guided setup checklist, plain-language settings, and a light/dark/system theme toggle.

<p align="center">
  <img src="docs/screenshots/ui-settings-light.png" width="49%" alt="Settings in light mode" />
  <img src="docs/screenshots/ui-settings-dark.png" width="49%" alt="Settings in dark mode" />
</p>

### New campaign — pick a mode first
![New campaign — Leads-hunt or Job-search mode](docs/screenshots/ui-campaign-new.png)

### Overview — your pipeline at a glance
![Arlo overview dashboard](docs/screenshots/overview.png)

### Arlo — talk or type, same rules either way
![Arlo voice assistant](docs/screenshots/assistant.png)

### Leads — one business = one lead, deduped by domain
![Leads table](docs/screenshots/leads.png)

### Campaigns — discover → research → verify → draft → approve → send
![Campaign detail](docs/screenshots/campaigns.png)

### Inbox — replies, bounces and opt-outs, each in its own view
![Inbox](docs/screenshots/inbox.png)

### Reports — honest metrics, explicitly defined
![Reports](docs/screenshots/reports.png)

---

## Features

### 🧭 Lead discovery & CRM
- **Find businesses** with a search provider (Serper.dev or Google Places) from a plain-English brief.
- **One business = one lead**, de-duplicated by canonical domain (+ city for legitimate branches).
- **CSV import** with automatic column mapping and the same dedup, plus **manual add** of a lead or an individual email/contact.
- Rich lead detail: contacts, verification status, evidence-bound research findings, full stage history and provenance.
- **Bulk actions** — verify, research or draft across every lead matching your current filter in one click.

### 🔎 Research (evidence-bound)
- Fetches a lead's public pages through an **SSRF-safe** fetcher (blocks private, loopback, link-local and cloud-metadata addresses).
- Produces **facts and opportunities tied to evidence** — it will not claim a site is "slow", "insecure" or "losing revenue" without a measurement.
- Risky or unverifiable claims are flagged for manual review rather than sent.
- **Email enrichment (free, no API):** harvests contact emails from the prospect's own site (`mailto:` links and on-page addresses) during research, so leads that arrived without a contact become reachable. Junk/placeholder addresses are filtered; the first good address becomes the primary contact.
- **Buying-signal detection:** hashes each site's content and flags when it changes between checks (a redesign, a new page) — a timely, specific reason to reach out again, surfaced in Reports.

### ✅ Email verification
- Deliverability through **ZeroBounce**, **NeverBounce**, or **Email Awesome** (asynchronous, via a secured results webhook).
- Only **deliverable** contacts qualify for automatic sending by default; catch-all/unknown require an explicit opt-in and stay labelled.

### ✍️ Outreach that stays honest
- Drafts in your configured **writing voice**, grounded in your real services and the lead's research.
- A deterministic **scrubber** blocks forbidden content (prices, discounts, guarantees, invented results/testimonials/credentials) *before* anything can send.
- **Idempotent sending** (a message can never be sent twice), per-RFC `List-Unsubscribe` headers, and one-click public unsubscribe.
- Three modes per campaign: **Draft-only**, **Approve-first** (you click send), **Automatic** (sends within all guards).
- **A/B subject lines:** give a campaign a set of subject variants (with a `{{business}}` token) and drafts rotate through them automatically, each tagged so Reports can compare reply rate per variant. Leave it empty and Arlo writes a fresh, unique subject every time.

### 🧑‍💼 Job-search mode
- Flip a campaign into **Job-search mode** and Arlo flips the whole engine around: it finds **companies hiring** for a target role (with an optional "posted within N days" freshness filter), researches each one, and drafts outreach that pitches **you** as the candidate — with your uploaded **CV attached to every email**. Same discovery → research → draft → approve → follow-up → reply-handling pipeline, same guardrails.

### 📥 Inbox, replies & follow-ups
- IMAP sync (UIDVALIDITY-aware, deduped, threaded). Reply classification drafts a suggested response. *(Send-only mailboxes skip this — they send but don't monitor replies.)*
- **Any reply pauses follow-ups before the AI runs**; opt-outs auto-suppress; hard bounces suppress, temporary bounces don't.
- **Filtered inbox views** — All, **Replies** (real human responses), **Sent**, Needs-attention, Interested, Out-of-office, Bounces, **Unsubscribes**, Unmatched and Archived, each with live counts.
- **Opt-out safety net:** an "unsubscribe / opt-out / remove me" in *any* inbound reply suppresses the sender immediately — even when the reply can't be matched to a lead — so no one who asks to stop is emailed again.
- **Hot-reply alerts:** the moment an interested, pricing, meeting or info-request reply lands, Arlo emails you (to an address you choose) with the message, so you can jump on it.

### 📅 Scheduling — your calendar, your keys
- Connect **your own** Cal.com or Google Calendar booking link (and, optionally, your own Cal.com API key, stored encrypted). When a prospect is interested, Arlo offers your link in the suggested reply so they can self-book. No third-party credentials are ever involved — the connection is entirely yours.

### 🤖 Arlo — personal assistant (voice + text)
- **Push-to-talk**: microphone permission is requested only when you activate voice; your speech is transcribed, **shown for you to edit before it's sent**, and the audio is discarded (no recordings kept).
- Clear **Listening / Transcribing / Thinking / Speaking** states, with stop-playback, cancel-recording and a text-only fallback.
- **Configurable speech providers**, kept separate from your reasoning model — speech-to-text via OpenAI Whisper or Deepgram; text-to-speech via OpenAI or ElevenLabs.
- Arlo can summarise your inbox, explain reports, research a lead, operate campaigns, schedule reminders and manage memory — **with the same permissions, budgets, suppression and confirmation rules as typed requests**. Mutating actions require confirmation; ambiguous names and dates are resolved first.
- **Editable personal & business memory** (durable preferences, distinct from conversation context) — and it will **never** store a password or API key as memory.
- **Durable reminders** and an optional **daily briefing** on the background worker (Asia/Karachi by default; the interpreted time is shown when scheduling).

### 📊 Reports, analytics & budgets
- Every metric shows its **numerator and denominator**. "Delivered" is only counted when a provider confirms it.
- **Click tracking, honestly done:** links in outgoing emails are wrapped so clicks are logged (who clicked, and where to) and shown in Reports. **No open tracking** — Arlo never embeds a tracking pixel, so you never see the inflated, bot-driven "open rates" that pixels produce. The unsubscribe link is never wrapped, and the redirect only forwards to `http(s)` targets.
- **Deliverability health:** live hard-bounce rate with a warning when it approaches the threshold that gets senders suspended, plus a breakdown of your suppression list by reason.
- **Reply rate by industry** and **A/B subject performance**, so you can see what's actually working and focus where replies come from.
- **Budgets you control**: daily/monthly spend, daily AI requests, new leads, research, emails per day/hour, follow-up caps — enforced by an **atomic, concurrency-safe reservation engine** that can't overspend. Transcription, reasoning and speech costs are tracked separately and roll into your daily spend.
- One **Emergency pause** stops all outbound instantly.

---

## Quick start

> Arlo is a single-owner, self-hosted app. You need **Node 20+**, **PostgreSQL** and **Redis**.

```bash
git clone https://github.com/Yarqat/Arlo.git
cd Arlo
corepack enable && pnpm install        # or: npm install

cp .env.example .env                   # then edit .env (see below)
pnpm prisma db push                    # create the schema
pnpm seed:owner                        # creates your login (prints a one-time password)

pnpm build
pnpm start                             # web app (reads PORT/HOSTNAME)
pnpm worker                            # in a second process: the background worker
```

Open the app, sign in with the seeded email + one-time password, and change it in **Settings → Security**.

### Minimum `.env`

```ini
DATABASE_URL="postgresql://user:pass@127.0.0.1:5432/arlo?schema=public"
APP_ENCRYPTION_KEY="<64 hex chars>"    # openssl rand -hex 32
SESSION_SECRET="<32+ random chars>"    # openssl rand -hex 32
REDIS_URL="redis://127.0.0.1:6379/4"
APP_URL="https://arlo.example.com"
```

All provider keys (AI, search, verifier, speech) are **optional in `.env`** — you can add them in the Settings UI instead, where they're stored **AES-256-GCM encrypted**. Keys set in `.env` take precedence. See [`.env.example`](.env.example) for the full list.

### First campaign
1. **Settings → Connections** — add an AI key (OpenAI or Anthropic), test, approve a model, assign it to each task. You can mix providers per task.
2. **Settings → Search / Email verifier** — add keys and test.
3. **Settings → Mailboxes** — add your sending identity. Pick the **Gmail** or **Microsoft 365** preset to auto-fill the servers (use an app password), then test. IMAP is optional: add it so Arlo can read replies, or save the mailbox **send-only** (it will send but can't monitor replies).
4. **Campaigns → New** — pick a mode first — **Leads hunt** (pitch your services to businesses) or **Job-search** (pitch yourself to companies hiring, CV attached) — then describe your targets in plain English → review the brief → create (starts in Draft-only).
5. Run discovery, review the drafts, and **Approve & send** — or switch the campaign to Automatic once you trust it.

---

## Arlo (voice)

Voice is additive — Arlo always works by text. To enable talking:

1. **Settings → Voice & assistant** → add a **speech-to-text** key (OpenAI Whisper or Deepgram) and test.
2. Add a **text-to-speech** key (OpenAI or ElevenLabs) if you want spoken replies, and toggle **Speak replies**.
3. On the **Assistant** screen, **hold the mic** to talk. Your words appear in the box to edit, then you send them.

Speech providers are independent of your reasoning model — Arlo never assumes your chat key can do audio.

---

## Providers

| Capability | Providers | Where |
|---|---|---|
| Reasoning (per-task) | OpenAI, Anthropic, **or your own Claude Code / Codex CLI subscription** | Settings → Connections |
| Lead discovery | Serper.dev, Google Places | Settings → Search |
| Email verification | ZeroBounce, NeverBounce, Email Awesome | Settings → Email verifier |
| Speech-to-text | OpenAI (Whisper / gpt-4o-transcribe), Deepgram | Settings → Voice |
| Text-to-speech | OpenAI, ElevenLabs | Settings → Voice |
| Mail | Any SMTP mailbox (Gmail / Microsoft 365 presets); IMAP optional for reply monitoring | Settings → Mailboxes |
| Scheduling | Your own Cal.com / Google Calendar link | Settings → Automation & scheduling |

**Bring your own AI subscription.** Instead of a metered API key, you can point a task at the **Claude Code** or **OpenAI Codex** CLI installed on the server — every AI call then runs on the flat plan you already pay for (Claude Pro/Max or ChatGPT Plus/Pro), with no per-token API bill. Each call runs in a read-only, throwaway workspace. Prefer an API key? That still works — it's per task. (CLI subscriptions are for the self-hosted deployment only.)

The newest OpenAI and Anthropic models that reject a custom `temperature` are handled transparently. Email Awesome results arrive at a **secured webhook** (`/api/public/verifier/emailawesome`) whose bearer secret is verified *before* the body is trusted.

---

## Safety & guardrails

- **AI proposes, code enforces.** Suppression, idempotency, verification freshness, send schedule, hourly/daily limits and budgets are deterministic checks in a pre-send gate — not left to the model.
- **Honesty by construction.** A forbidden-content scrubber blocks invented prices, discounts, guarantees, portfolio, results, testimonials and credentials before any send.
- **No dark patterns in tracking.** Click tracking is a transparent redirect (http/https targets only) you can switch off; Arlo never embeds open-tracking pixels, never fabricates metrics, and never wraps your unsubscribe link.
- **Untrusted input.** Scraped web pages and inbound emails are treated as data, never instructions (prompt-injection hardened). Email verification never bypasses CAPTCHAs or scrapes private accounts; Arlo never guesses email addresses.
- **Encrypted secrets.** Integration credentials are AES-256-GCM encrypted at rest (key in `.env`, outside the database). Logs redact secrets. The app binds to localhost behind your reverse proxy.
- **Your controls.** One-click emergency pause; per-campaign budgets; a model allowlist the AI cannot escape; one-click + `List-Unsubscribe` opt-out.

Use Arlo in line with the laws and anti-spam rules that apply to you (e.g. CAN-SPAM, GDPR/PECR, CASL). You are responsible for who you contact and what you claim.

---

## Architecture

```
Next.js 16 (App Router) ── owner-auth middleware ── React 19 + Tailwind 4 UI
          │
          ├─ API routes (zod-validated, owner-gated, consistent error mapping)
          │
          ├─ Prisma ── PostgreSQL   (leads, contacts, messages, budgets, audit, …)
          │
          └─ BullMQ ── Redis ── worker process
                                   ├─ discovery → research → verify → draft → send
                                   ├─ IMAP sync, reply handling, follow-ups
                                   └─ 60s automation tick + reminders + daily briefing
```

- **Deterministic core** in `src/lib`: `budget` (atomic reservations), `suppression`, `dedup`, `pipeline/*` (stage, preflight, outreach, research, verify, imap, reply), `providers/*` (ai, search, verifier, email, speech), `net/safe-fetch` (SSRF guard), `crypto` (AES-256-GCM + scrypt).
- **Tests:** `pnpm test` runs a focused suite (dedup, CSV, bounce classifier, SSRF, scrubber, suppression-across-campaigns, concurrent-budget-never-overspends, model allowlist) against an isolated test database.

```bash
pnpm test        # vitest
pnpm prisma studio   # inspect the database
```

---

## License

[MIT](LICENSE) © Yarqat. Arlo is free for everyone.
