# BotForge staging deployment runbook

This runbook prepares a controlled staging deployment. It does not claim that a cloud environment has been provisioned or that a live database has been tested.

## 1. Required services

- A Node.js 20+ application host with persistent environment variables and HTTPS.
- A managed PostgreSQL database reachable from the application host.
- A private persistent volume or S3-compatible object store if original uploads will be retained in a future release. The current app extracts text and deletes temporary upload files.
- At least one server-side AI provider API key with billing enabled.
- A trusted reverse proxy/load balancer. Set `TRUST_PROXY=1` only when the app is behind exactly one trusted proxy.

## 2. Configure secrets

Set these in the hosting provider's secret manager. Never commit real values to Git.

- `NODE_ENV=production`
- `PORT` to the port supplied by the host.
- `JWT_SECRET` to a cryptographically random value of at least 32 characters.
- `DATABASE_URL` to the managed PostgreSQL connection string.
- `PGSSL_REJECT_UNAUTHORIZED=true` when the provider supplies a trusted TLS certificate.
- `PG_POOL_MAX` to a conservative connection count within the database plan.
- `METRICS_TOKEN` to a random bearer token if Prometheus scraping is enabled; `/metrics` is disabled when unset.
- `FREE_DAILY_MESSAGES` to the staging quota.
- One or more of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_GEMINI_API_KEY`.

Do not set `PGSSL=disable` for a public managed database. Do not expose provider keys or `DATABASE_URL` to browser code.

## 3. Prepare and migrate data

For an existing JSON installation:

1. Stop writes to the old instance and take a timestamped backup of `data/db.json`.
2. Keep the backup read-only and store a separate copy outside the application host.
3. Configure `DATABASE_URL` in a protected staging environment.
4. Run `npm ci`, then `npm run migrate:postgres -- --dry-run`.
5. Review preflight counts and errors. Do not proceed if any record fails validation.
6. Run `npm run migrate:postgres` once.
7. Verify imported collection counts and the migration marker directly in PostgreSQL.
8. Start the app with the same `DATABASE_URL). Startup creates the runtime repository and quota reservation table if absent.

The importer runs in one transaction and records a one-time marker. It does not copy original uploaded files. Do not delete or overwrite the JSON backup after migration.

For a fresh database, apply `migrations/001_initial_schema.sql` using the database migration process, then start the app. The app creates the JSONB runtime repository and quota reservation table during startup.

For a reproducible local PostgreSQL staging rehearsal, copy `.env.example` to `.env`, set `POSTGRES_PASSWORD` and `JWT_SECRET`, then run `docker compose -f docker-compose.staging.yml up --build -d`. Wait for the `botforge` service healthcheck, then run the staging smoke tests below. This stack is for staging only, not public production hosting.

## 4. Staging smoke tests

Before inviting users, verify all of the following:

- `GET /healthz` returns HTTP 200.
- `GET /readyz` returns HTTP 200 and reports `database: postgres`.
- Sign-up, login, logout and session restoration work over HTTPS.
- A user can create a private bot; another account cannot read or edit it.
- A public bot can be opened by another signed-in account without exposing private instructions.
- Document upload, retrieval citations and document deletion work for the owner only.
- Chat works with a real provider key; provider failures release quota reservations.
- Concurrent requests at the daily limit do not exceed the configured quota across multiple app instances.
- Bot deletion removes its dependent runtime records.
- Restart the app and confirm users, bots, documents, messages and usage remain available.

Use synthetic test accounts and non-sensitive documents only.

## 5. Backups and rollback

- Enable managed PostgreSQL automated backups and point-in-time recovery where available.
- Create an operator-side custom-format backup with `npm run backup:postgres` (requires PostgreSQL client tools and `DATABASE_URL`).
- Restore only to an explicitly selected target database with `BACKUP_FILE=... CONFIRM_RESTORE=YES npm run restore:postgres`; verify the target connection before confirming.
- Before every schema or release change, record a backup identifier and test restoration into a separate staging database.
- Keep the previous application image/release available for rollback.
- If migration or smoke tests fail, stop traffic, preserve logs, restore the pre-migration database snapshot if required, and redeploy the previous application release.
- Never point an old JSON-backed application at a partially migrated database or delete the source backup until reconciliation is signed off.

## 6. Release gates

Do not call the service production-ready until:

- A live managed PostgreSQL staging rehearsal and rollback have passed.
- Tenant-isolation, provider failure, quota concurrency and upload security tests pass.
- HTTPS, secret rotation, rate limits, backups and restore have been verified.
- Browser end-to-end, load and independent security testing have passed.
- Monitoring and an incident contact/process are in place.

Billing, opt-in automatic memory and optional embedding-based hybrid retrieval are implemented but require operator credentials/configuration and live staging verification. Workspaces/RBAC and enterprise controls remain outside the current release scope.

## 7. Optional product configuration

- For semantic/hybrid document retrieval, set `BOTFORGE_EMBEDDINGS_ENABLED=true` and configure `OPENAI_API_KEY`. This sends document chunks and chat queries to the OpenAI embeddings API and may incur usage charges. Leave it disabled to use keyword retrieval only.
- Configure `BOTFORGE_ADMIN_EMAILS` with comma-separated administrator account emails to unlock `/admin.html` and the `/api/admin` endpoints. Keep this allowlist short and controlled.
- Configure `BOTFORGE_PLANS_JSON` to override daily message quotas for Free, Plus and Pro. The defaults are intended for development and must be reviewed before commercial use.
- For Stripe subscriptions, configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` and `STRIPE_PORTAL_RETURN_URL`. Register `POST /api/billing/webhook` and subscribe to `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`. Test in Stripe test mode first.\n- For India-focused Razorpay subscriptions, create recurring subscription plans in the Razorpay Dashboard and configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_PLUS`, `RAZORPAY_PLAN_PRO` and optionally `RAZORPAY_SUBSCRIPTION_TOTAL_COUNT`. Register `POST /api/billing/razorpay/webhook` in Razorpay and subscribe to subscription lifecycle events (at minimum activated, charged, updated, cancelled and completed). Verify test-mode UPI/card/netbanking checkout and webhook delivery before enabling live payments. Razorpay checkout uses hosted subscription links; actual payment methods depend on merchant account activation and Razorpay configuration.
- Users can manage opt-in automatic memory from the bot chat memory panel. It triggers an additional provider request after a chat turn; review provider cost and retention policies before enabling it broadly.
