# Installing Arlo — A to Z

A complete, self-contained guide to running **Arlo** on your own Linux server:
every prerequisite, the database and cache, the headless browser, the full
environment, building, running it as proper background services behind HTTPS,
and keeping it updated. No step assumed.

> Arlo is a **single-owner, self-hosted** app. One person signs in and runs it.
> (The multi-tenant SaaS edition is a separate, private project.)

**What you'll end up with**
- The web app on `127.0.0.1:3430`, proxied by nginx at `https://arlo.yourdomain.com`
- A background worker doing discovery → research → drafting → sending
- PostgreSQL for data, Redis for the job queue
- A built-in headless Chromium so Arlo can read modern JavaScript websites

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Linux server | any modern | Ubuntu 22.04/24.04 or Debian 12 assumed below |
| **Node.js** | **20 LTS or newer** | 22 LTS recommended |
| **pnpm** | 9+ | via `corepack` (ships with Node) |
| **PostgreSQL** | 14+ | the datastore |
| **Redis** | 6+ | the BullMQ job queue |
| **Chromium** | any recent | for built-in JavaScript rendering (optional but recommended) |
| git, curl, build tools | — | `build-essential` for native modules |

Install the base packages (Ubuntu/Debian):

```bash
sudo apt-get update
sudo apt-get install -y curl git build-essential postgresql redis-server chromium
# On some distros the browser package is called chromium-browser instead:
# sudo apt-get install -y chromium-browser
```

Install Node 20+ (via NodeSource) and enable pnpm:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
corepack enable            # provides pnpm
pnpm --version             # confirm it works
```

---

## 2. Get the code

Create a service user and clone into `/opt/arlo` (any path works):

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin arlo
sudo mkdir -p /opt/arlo && sudo chown arlo:arlo /opt/arlo
sudo -u arlo git clone https://github.com/Yarqat/Arlo.git /opt/arlo
cd /opt/arlo
```

Install dependencies:

```bash
sudo -u arlo pnpm install
```

---

## 3. PostgreSQL — database and user

```bash
sudo -u postgres psql <<'SQL'
CREATE USER arlo_app WITH PASSWORD 'CHANGE_ME_STRONG';
CREATE DATABASE arlo OWNER arlo_app;
GRANT ALL PRIVILEGES ON DATABASE arlo TO arlo_app;
SQL
```

Your connection string will be:
`postgresql://arlo_app:CHANGE_ME_STRONG@127.0.0.1:5432/arlo?schema=public`

---

## 4. Redis — job queue

Redis from apt listens on `127.0.0.1:6379` by default — that's enough. Confirm:

```bash
redis-cli ping     # -> PONG
```

If you set a password in `/etc/redis/redis.conf` (recommended on shared hosts),
put it in `REDIS_URL` as `redis://:password@127.0.0.1:6379/4`. Arlo uses logical
DB `4` by default (change the trailing number to isolate it from other apps).

---

## 5. Chromium — built-in JavaScript rendering

Arlo renders JavaScript-heavy prospect sites (Wix, Squarespace, React) using a
headless Chromium **already on the host**, driven by `puppeteer-core` (installed
with the app — no 300 MB browser download). It turns on automatically when a
browser is found at a standard path.

```bash
which chromium || which chromium-browser     # confirm one exists
```

- **Nothing to configure** if the browser is at a standard location.
- Custom path? Set `CHROMIUM_PATH=/path/to/chromium` in `.env`.
- Want it off? Set `RENDER_JS=false` — Arlo falls back to a plain fetch plus a
  built-in HTML→markdown cleaner (works, but can't execute JavaScript).

> No Chromium on the box is fine — Arlo still runs, it just can't render JS-only
> pages. You can also point Arlo at [Firecrawl](https://www.firecrawl.dev/)
> instead (hosted or self-hosted) via `FIRECRAWL_API_KEY` / `FIRECRAWL_BASE_URL`.

---

## 6. Configure the environment

```bash
cd /opt/arlo
sudo -u arlo cp .env.example .env
# generate the two secrets:
openssl rand -hex 32     # use for APP_ENCRYPTION_KEY (64 hex chars)
openssl rand -hex 32     # use for SESSION_SECRET
sudo -u arlo nano .env
```

**Required**

| Variable | What it is |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string from step 3 |
| `APP_ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`) — encrypts stored integration secrets (AES-256-GCM) |
| `SESSION_SECRET` | 32+ random chars — signs your session cookie |

**Infrastructure (have sensible defaults)**

| Variable | Default | Notes |
|---|---|---|
| `REDIS_URL` | `redis://127.0.0.1:6379/4` | |
| `BULLMQ_PREFIX` | `arlo` | queue namespace |
| `APP_URL` | — | your public URL, e.g. `https://arlo.yourdomain.com` (used for webhooks/unsubscribe links) |
| `TZ` | `Asia/Karachi` | reporting timezone |
| `PORT` / `HOSTNAME` | `3430` / `127.0.0.1` | where the web app listens |

**Rendering (optional)** — `RENDER_JS`, `CHROMIUM_PATH`, `FIRECRAWL_API_KEY`,
`FIRECRAWL_BASE_URL` (see step 5).

**Provider keys (all optional here)** — AI (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`),
search (`SEARCH_API_KEY`), verifier (`VERIFIER_API_KEY`), voice (`STT_API_KEY` /
`TTS_API_KEY`). You can leave these blank and add them in the **Settings UI**
instead, where they're stored AES-256-GCM encrypted. Keys in `.env` take
precedence. Full list: [`.env.example`](.env.example).

---

## 7. Initialize the database and create your login

```bash
cd /opt/arlo
sudo -u arlo pnpm db:push        # create the schema (or: pnpm db:migrate)
sudo -u arlo pnpm seed:owner     # creates your owner account — prints a one-time password
```

Copy the one-time password it prints — you'll change it on first login.

---

## 8. Build

```bash
sudo -u arlo pnpm build          # runs prisma generate + next build
```

---

## 9. Run it

**Two processes**: the web app and the background worker.

Quick manual run (to confirm everything works):

```bash
sudo -u arlo pnpm start          # web on 127.0.0.1:3430
# in a second shell:
sudo -u arlo pnpm worker         # the background worker
```

Visit `http://127.0.0.1:3430` (or your proxied domain), sign in with the seeded
email + one-time password, and change it in **Settings → Security**. Once it
works, stop both and set them up as services (next step).

---

## 10. Run as systemd services

Create an environment file systemd can read (same values as your `.env`):

```bash
sudo install -m 600 -o arlo -g arlo /opt/arlo/.env /etc/arlo.env
```

**Web** — `/etc/systemd/system/arlo-web.service`:

```ini
[Unit]
Description=Arlo web
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=arlo
WorkingDirectory=/opt/arlo
EnvironmentFile=/etc/arlo.env
ExecStart=/usr/bin/pnpm start
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

**Worker** — `/etc/systemd/system/arlo-worker.service`:

```ini
[Unit]
Description=Arlo worker
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=arlo
WorkingDirectory=/opt/arlo
EnvironmentFile=/etc/arlo.env
ExecStart=/usr/bin/pnpm worker
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

> `pnpm` path: run `which pnpm` and use that in `ExecStart` if it isn't
> `/usr/bin/pnpm` (corepack often installs a shim elsewhere).

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now arlo-web arlo-worker
systemctl status arlo-web arlo-worker
journalctl -u arlo-worker -f        # tail the worker
```

---

## 11. HTTPS with nginx + Let's Encrypt

Point `arlo.yourdomain.com`'s DNS **A record** at your server, then:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/arlo`:

```nginx
server {
    server_name arlo.yourdomain.com;

    client_max_body_size 25m;          # allow CV / attachment uploads

    location / {
        proxy_pass http://127.0.0.1:3430;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/arlo /etc/nginx/sites-enabled/arlo
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d arlo.yourdomain.com     # provisions + auto-renews TLS
```

Set `APP_URL="https://arlo.yourdomain.com"` in `/etc/arlo.env` and restart:
`sudo systemctl restart arlo-web arlo-worker`.

---

## 12. First-run configuration (in the app)

1. **Settings → Connections** — add an AI key (OpenAI or Anthropic), test,
   approve a model, assign it to each task.
2. **Settings → Profile → Learn my brand** — paste your website; Arlo reads it
   and fills in your summary, services and brand voice so outreach sounds like
   you and offers what you actually do.
3. **Settings → Search / Email verifier** — add keys and test (optional).
4. **Settings → Mailboxes** — add your sending identity (Gmail / Microsoft 365
   presets auto-fill the servers; use an app password). Add IMAP so Arlo can
   read replies, or save send-only.
5. **Settings → Deliverability** — check your domain's SPF/DKIM/DMARC and fix
   anything red before you send.
6. **Campaigns → New** — pick a mode, describe your targets in plain English,
   review the brief, and create (starts in Draft-only). Review drafts and
   **Approve & send**, or switch to Automatic once you trust it.

---

## 13. Updating

```bash
cd /opt/arlo
sudo -u arlo git pull
sudo -u arlo pnpm install
sudo -u arlo pnpm db:migrate         # apply any new migrations (or db:push)
sudo -u arlo pnpm build
sudo systemctl restart arlo-web arlo-worker
```

---

## 14. Backups

- **Database:** `pg_dump arlo > arlo-$(date +%F).sql` on a schedule.
- **Secrets:** back up `APP_ENCRYPTION_KEY` — without it, stored integration
  secrets can't be decrypted. Keep it somewhere safe and separate.

---

## 15. Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid environment: DATABASE_URL…` on build/start | A required var is missing. The build reads env too — ensure `.env` / `EnvironmentFile` is loaded before `pnpm build` and in the service. |
| Worker idle, nothing sends | Check Redis (`redis-cli ping`), and `journalctl -u arlo-worker -f`. "Outside sending hours" / "Campaign is PAUSED" in the activity log are expected pacing, not errors. |
| JS sites come back empty | No Chromium found. Install `chromium`/`chromium-browser`, or set `CHROMIUM_PATH`. Confirm with `which chromium`. |
| Chromium won't launch under systemd | Already handled with `--no-sandbox --disable-dev-shm-usage`. Ensure the browser package is installed for the **service user**, and `/dev/shm` isn't tiny. |
| Port 3430 in use | Change `PORT` in env (and your nginx `proxy_pass`). |
| Uploads fail | Raise nginx `client_max_body_size`. |

---

## 16. Security notes

- Keep `APP_ENCRYPTION_KEY` and `SESSION_SECRET` secret and backed up.
- Bind the web app to `127.0.0.1` (default) and expose it **only** through nginx + TLS.
- Lock down PostgreSQL and Redis to localhost; set a Redis password on shared hosts.
- Arlo never sends an email you haven't approved unless you explicitly switch a
  campaign to Automatic — review drafts until you trust it.

---

Questions or issues: open one on the [GitHub repo](https://github.com/Yarqat/Arlo).
