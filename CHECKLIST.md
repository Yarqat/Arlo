# Yarqat Agent — implementation checklist

Legend: [x] done & verified · [~] partial · [ ] todo

## Foundation
- [x] Inspect server; reuse Next.js/systemd/nginx/Postgres pattern
- [x] Postgres role `yarqat_app` + db `yarqat`; secrets in `/srv/yarqat/shared/.env`
- [x] Prisma schema (all required entities) + db push
- [x] AES-256-GCM secret encryption (key in .env); scrypt password hashing
- [x] Auth (owner session, httpOnly cookie, middleware route protection, throttle)
- [x] Dashboard shell: Overview, Assistant, Leads, Campaigns, Inbox, Reports, Settings
- [x] UI kit (buttons, cards, tables, badges, dialogs, empty states)
- [x] systemd web service (hardened) + nginx vhost + Let's Encrypt TLS
- [x] Live at https://agent.yarqat.com, login verified end-to-end
- [x] Budget reservation engine (atomic, concurrency-safe, monthly guard)
- [x] AI adapters (OpenAI, Anthropic) + allowlist-enforcing task runner
- [x] Emergency pause control

## In progress / remaining
- [~] Background worker + BullMQ queues (scaffold running; processors being filled)
- [ ] Settings: Connections UI (keys, model discovery, allowlist, assignments, test)
- [ ] Settings: Mailboxes (SMTP/IMAP, test, schedule)
- [ ] Settings: Search provider + Email verifier adapters & UI
- [ ] Settings: Profile, Services, Writing, Budgets, Suppression, Security, Backups
- [ ] CSV import + domain-canonical dedup + lead detail
- [ ] Campaign brief creator (plain-English → editable brief)
- [ ] Lead discovery (search API adapter)
- [ ] Website research (safe fetch, SSRF guard, findings)
- [ ] Email verification pipeline
- [ ] Outreach drafting + review + sending (idempotency, suppression, schedule)
- [ ] IMAP sync + threaded inbox + thread view
- [ ] Follow-up sequences + pre-send rechecks
- [ ] Reply classification + drafting
- [ ] Assistant actions (bounded tools)
- [x] Reports (definitions, numerator/denominator, no open-rate)
- [ ] Prompt-injection hardening for untrusted web/email text
- [ ] Focused tests (dedup, dup-send, concurrent budget, reply-vs-followup, bounce suppression, etc.)
- [ ] Backups + restore procedure
- [ ] Security review pass
