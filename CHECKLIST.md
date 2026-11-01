# Yarqat Agent — implementation checklist

Legend: [x] done & verified

## Foundation
- [x] Inspect server; reuse Next.js/systemd/nginx/Postgres pattern
- [x] Postgres role `yarqat_app` + db `yarqat`; secrets in `/srv/yarqat/shared/.env`
- [x] Prisma schema (all required entities) + db push
- [x] AES-256-GCM secret encryption (key in .env); scrypt password hashing
- [x] Auth (owner session, httpOnly cookie, middleware route protection, throttle)
- [x] Dashboard shell: Overview, Assistant, Leads, Campaigns, Inbox, Reports, Settings
- [x] UI kit (buttons, cards, tables, badges, dialogs, empty states)
- [x] systemd web + worker (hardened) + nginx vhost + Let's Encrypt TLS
- [x] Live at https://agent.yarqat.com, login verified end-to-end
- [x] Budget reservation engine (atomic, concurrency-safe, monthly guard)
- [x] AI adapters (OpenAI, Anthropic) + allowlist-enforcing task runner
- [x] Emergency pause control

## Delivered
- [x] Background worker + BullMQ queues + automation tick (hardened systemd)
- [x] Settings: Connections (keys, model discovery, allowlist, per-task assignment, test)
- [x] Settings: Mailboxes (SMTP/IMAP encrypted, connection test)
- [x] Settings: Search provider + Email verifier adapters & UI (env-or-encrypted keys)
- [x] Settings: Profile, Services, Portfolio, Writing, Budgets, Suppression, Security, Backups
- [x] CSV import + domain-canonical dedup + rich lead detail
- [x] Campaign brief creator (plain-English -> editable brief) + campaign controls
- [x] Lead discovery (Serper / Google Places) + public-email extraction
- [x] Website research (SSRF-safe fetch, evidence-bound findings, risky-claim guard)
- [x] Email verification pipeline (ZeroBounce / NeverBounce)
- [x] Outreach drafting + review/approve + idempotent sending (suppression, schedule, limits)
- [x] IMAP sync (UIDVALIDITY, dedup, threading) + threaded inbox + owner reply
- [x] Follow-ups + deterministic pre-send rechecks (reply pauses before AI)
- [x] Reply classification + draft-for-review + auto-unsubscribe
- [x] Assistant actions (whitelisted: pause/resume, spend, interested, create draft campaign)
- [x] Reports (explicit definitions, numerator/denominator, no open-rate/pixels)
- [x] Prompt-injection hardening (untrusted web/email treated as data) + price/claim scrubber
- [x] One-click unsubscribe (public) + List-Unsubscribe headers
- [x] Focused tests (19): dedup, multi-email, concurrent budget, bounce classify, suppression
      survives reimport, unsubscribe cancels across campaigns, model allowlist, SSRF, CSV
- [x] Daily DB backup timer + tested restore procedure
- [x] Security pass: localhost-only port, headers, 401/redirect gating, encrypted secrets,
      redacted logs, login throttle

## Known limitations
- Provider credentials (AI / search / verifier / mailbox) must be supplied before live use
- Claude Code CLI adapter present but intentionally gated (needs dedicated server user)
- No provider delivery-event webhooks wired yet (delivery shown only when a provider confirms)
