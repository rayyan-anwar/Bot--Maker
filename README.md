# Botworks — build-your-own AI bot platform

A small web app where people sign up, create their own custom AI bots (name +
personality instructions + optional reference documents), and chat with them
— or make them public so other users can chat with them too.

## What's inside

- **Accounts** — signup/login with hashed passwords, session cookies
- **Bot builder** — each user creates bots with a name, description, and
  instructions (a system prompt)
- **Document upload** — attach `.txt`, `.md`, or `.pdf` files to a bot; the
  bot searches them for relevant snippets when answering (lightweight keyword
  search, no external vector database needed)
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

## Growing past this

This is a working MVP, not a finished product. Natural next steps, roughly
in order of how soon you'd hit them:

1. **Swap `server/store.js` for a real database.** Every other file only
   calls functions like `store.insert(...)` and `store.findById(...)`, so
   this is a contained change — rewrite `store.js` to talk to Postgres (or
   similar) and nothing else needs to change.
2. **Rate-limit chat requests** so one user can't run up your Anthropic
   bill. (`express-rate-limit` is a common choice.)
3. **Smarter document search.** The current search is keyword-matching,
   which works okay for most documents but isn't as sharp as "real" AI
   search. The standard upgrade is an embeddings API (Anthropic recommends
   Voyage AI) plus a vector database — this only touches `server/retrieval.js`.
4. **Usage limits / billing**, if you want this to be a real product instead
   of something you're paying the API bill for personally.
5. **Password reset / email verification**, for a production-grade signup
   flow.

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
