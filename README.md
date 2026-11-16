# BotForge — Build. Train. Deploy. Your AI.

BotForge is evolving from a small web app where people sign up, create their own custom AI bots (name +
personality instructions + optional reference documents), and chat with them
— or make them public so other users can chat with them too.

## What's inside

- **Accounts** — signup/login with hashed passwords, session cookies
- **Bot builder** — each user creates bots with a name, description, and
  instructions (a system prompt)
- **Document upload** — attach `.txt`, `.md`, or `.pdf` files to a bot; the
  bot searches them with keyword retrieval by default; optional OpenAI embeddings enable hybrid semantic + keyword retrieval
- **Chat** — talks to the bot using the Claude API, with the bot's
  instructions + relevant document snippets + conversation history
- **Public/private bots** — keep a bot to yourself, or let other signed-up
  users find and chat with it

It's built with plain Node.js + Express on the backend, and plain HTML/CSS/JS
on the frontend — no build step, no framework to install.

Data is stored in a single JSON file (`data/db.json`) rather than a real
database. That's intentional for an MVP: nothing to install or configure,
and it's easy to swap out later (see "Growing past this" below).

## 1. Get an Anthropic API key

Your bots need this to actually think and respond.

1. Go to **https://console.anthropic.com** and sign up / log in.
2. Go to **Settings → API Keys** and create a new key.
3. Add credit to the account (Settings → Billing) — the API is pay-as-you-go,
   separate from any Claude.ai subscription.
4. Copy the key (starts with `sk-ant-...`) — you'll need it in step 3 below.

## 2. Install Node.js (if you don't have it)

You need Node.js 18 or newer. Check with:

```bash
node -v
```

If that fails or shows an older version, install it from **https://nodejs.org**
(the LTS version).

## 3. Set up and run locally

```bash
cd ai-bot-platform
npm install
cp .env.example .env
```

Open `.env` in a text editor and fill in:

```
ANTHROPIC_API_KEY=sk-ant-...        # the key from step 1
JWT_SECRET=...                       # any long random string
```

To generate a random `JWT_SECRET`, run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

and paste the output in.

Then start the server:

```bash
npm start
```

Open **http://localhost:3000** in your browser. Sign up, create a bot, and
chat with it.

## 4. Put it online so other people can use it

Any Node.js hosting service works. Two easy, free-to-start options:

**Render** (https://render.com)
1. Push this folder to a GitHub repo.
2. In Render: New → Web Service → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Under Environment, add `ANTHROPIC_API_KEY` and `JWT_SECRET` (same values
   as your `.env`).
5. Deploy. Render gives you a public URL.

**Railway** (https://railway.app)
1. Push this folder to a GitHub repo.
2. New Project → Deploy from GitHub repo.
3. Add the same two environment variables under Variables.
4. Railway builds and deploys automatically, and gives you a public URL.

Either way, people can then go to that URL, sign up, and make their own bots.

### Important: file storage on hosting services

This app saves data to local files (`data/db.json` and nothing persistent
for uploads, since document text is extracted into that same JSON file).
Some hosting services wipe the local disk on every deploy or restart
("ephemeral" storage) — Render's free tier does this. That means your users'
accounts and bots could vanish on a redeploy.

For anything beyond testing with friends, either:
- Use a host with a persistent disk (Render's paid "Disk" add-on, Railway's
  volumes), or
- Upgrade the storage layer to a real database (see below) and use a free
  one like Neon or Supabase (Postgres) or MongoDB Atlas.

## Database migration preparation

The repository includes a PostgreSQL baseline schema and a transactional importer. The importer seeds both normalized reporting tables and the JSONB runtime repository. After a successful import, configure the same `DATABASE_URL` for the application and it will use PostgreSQL automatically. Without `DATABASE_URL`, it uses the local JSON development adapter.

Before running an import, create a PostgreSQL database with the `pgcrypto` extension available, take a separate backup of `data/db.json`, and configure `DATABASE_URL`. Then run:

```bash
npm install
cp .env.example .env
# Set DATABASE_URL in .env, then:
npm run migrate:postgres
```

The import runs in a database transaction and records a one-time migration marker. Re-running it after success exits without importing again. Keep the JSON backup unchanged until row counts and application-level behavior have been independently verified. The importer does not copy uploaded originals or provide dual-write. Keep the original JSON backup until database row counts and app behavior have been verified.

## Growing past this

This is an MVP foundation, not a finished commercial service. The PostgreSQL JSONB repository is now wired into application routes. The application exposes `/healthz` for liveness and `/readyz` for database readiness. Tenant-scoped repository queries now filter at the storage layer rather than loading every tenant's records into route handlers. Optional hybrid retrieval is implemented with OpenAI embeddings and a keyword fallback; it is opt-in and stores vectors with document chunks. Remaining work includes automatic memory, configurable plan enforcement, billing, email verification/password recovery, live PostgreSQL staging, production secrets, monitoring, backups and security/load testing.

## Project structure

```
server/
  index.js        — starts the server, wires up routes
  store.js         — all data reads/writes (swap this for a real DB later)
  auth.js           — signup/login/logout/session handling
  bots.js            — create/edit/delete/list bots
  documents.js         — upload & manage reference documents per bot
  retrieval.js          — splits documents into chunks, finds relevant ones
  chat.js                — talks to the Claude API

public/
  index.html       — login / signup
  dashboard.html     — list your bots + browse public bots
  bot.html              — chat with a bot + (if you own it) settings/docs
  css/style.css           — all styling
  js/api.js                — small shared fetch helper

data/db.json        — all app data lives here (auto-created on first run)
uploads/              — temp folder used while processing an upload (files
                         are deleted right after their text is extracted)
```


## BotForge product direction

The current repository is an evolving MVP with implemented account, bot-building, multi-provider, memory, usage, PostgreSQL and subscription foundations. The technical audit, security gates, interface specification and phased roadmap are documented in:

- [Technical audit](docs/TECHNICAL_AUDIT.md)
- [Production roadmap](docs/PRODUCTION_ROADMAP.md)
- [Product and business strategy](docs/PRODUCT_STRATEGY.md)
- [UI/UX specification](docs/UX_UI_SPEC.md)
- [Security and release checklist](docs/SECURITY_AND_RELEASE_CHECKLIST.md)
- [Staging deployment runbook](docs/STAGING_DEPLOYMENT_RUNBOOK.md)
- Admin dashboard: `/admin.html` (requires `BOTFORGE_ADMIN_EMAILS`)
- PostgreSQL staging stack: `docker-compose.staging.yml`
- PostgreSQL backup/restore: `npm run backup:postgres` and `npm run restore:postgres` (restore requires explicit confirmation)
- Plan and checkout page: `/billing.html` (Stripe and optional Razorpay configuration; Razorpay subscription plans must be created in the Razorpay Dashboard)

**Important:** implemented code is not the same as a verified production service. PostgreSQL runtime support, provider adapters, retrieval embeddings and Stripe/Razorpay subscription integrations require operator credentials and live staging tests. JSON remains the local development default.

### Competitor references

- [Botpress pricing and plans](https://botpress.com/pricing)
- [Dify product and open-source platform](https://dify.ai/)
- [Voiceflow documentation](https://www.voiceflow.com/docs)

## Current upgrade branch implementation

The `botforge-production-upgrade` branch now also includes:
- Anthropic, OpenAI Responses API and Google Gemini provider adapters, with current default model IDs configurable through environment variables.
- Server-side daily message quota and token usage event recording (MVP JSON store).
- Account-wide personal AI memory profile shared across the user's bots/providers, plus per-bot editable notes and opt-in automatic extraction.
- Configurable Free/Plus/Pro daily message quotas and allowlisted admin endpoints to assign plans.
- Stripe and Razorpay subscription checkout/webhook integrations (require operator credentials, configured provider plans/prices and live webhook testing).
- Provider choice during bot creation.
- Private bot instructions excluded from public bot responses.
- Request size/rate controls, security headers, origin checks, safer auth validation and upload bounds.
- PostgreSQL JSONB runtime repository, PostgreSQL baseline schema and transactional JSON importer (live managed-database verification still pending).
- Basic retrieval unit tests and CI syntax-check workflow.

**Still not production-ready:** PostgreSQL runtime support is implemented but has not yet been tested against a live managed PostgreSQL database; retrieval supports optional OpenAI embedding generation and hybrid semantic/keyword ranking when `BOTFORGE_EMBEDDINGS_ENABLED=true` and an OpenAI API key is configured; no pgvector index or large-scale vector infrastructure is implemented; there is no admin web console, workspace/role system, streaming or completed live database/security/load test. Stripe and Razorpay checkout/webhook code is implemented but cannot be live-verified until the operator configures provider credentials, plan/price IDs and webhook secrets. Razorpay webhook endpoint: `POST /api/billing/razorpay/webhook`. Provider credentials must be configured by the operator in environment variables before each provider can be used.

### Current model references
- Anthropic model overview: https://platform.claude.com/docs/en/models/overview
- OpenAI model guidance: https://developers.openai.com/api/docs/guides/model-selection
- Gemini model catalog: https://ai.google.dev/gemini-api/docs/models


## Public accounts, admin separation and advertising

- The public login page supports email/password signup and login. New accounts receive the Free plan.
- The configured `BOTFORGE_ADMIN_EMAIL` is reserved and cannot be claimed through public signup. Bootstrap the administrator separately with `npm run admin:create`.
- Public users can access their own workspace and public bots. The administrator dashboard and APIs remain protected by server-side administrator identity checks.
- Accounts are locked after three incorrect password attempts. Unlock/reset is a server-side administrator operation.
- Login/signup advert and workspace/chat ad slots are placeholders only. No advertising network is active and no revenue is generated until an ad provider account is approved and its publisher code is configured.
- Google and GitHub OAuth buttons are displayed as pending integration and do not authenticate yet. Configure OAuth applications, callback URLs, verified email handling and secrets before enabling them. Instagram is not a general-purpose consumer login provider for arbitrary third-party apps; do not promise Instagram sign-in unless Meta offers an eligible supported product for the intended account type.
- Do not place ads inside private chat content or use private prompts, files, memories or conversations for ad targeting. Keep placements clearly labelled and respect consent and applicable advertising/privacy rules.
