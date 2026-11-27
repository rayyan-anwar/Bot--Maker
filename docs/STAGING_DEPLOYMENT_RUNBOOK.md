# BotForge staging deployment runbook

This runbook prepares a controlled staging deployment. It does not claim that a cloud environment has been provisioned or that a live database has been tested.

## 1. Required services

- A Node.js 20+ application host with persistent environment variables and HTTPS.
- A managed PostgreSQL database reachable from the application host.
- A private persistent volume or S3-compatible object store if original uploads will be retained in a future release. The current app extracts text and deletes temporary upload files.
- At least one server-side AI provider API key with billing enabled.
- A trusted reverse proxy/load balancer. `TRUST_PROXY` accepts only `0` (default, ignore all forwarding headers) or `1` (trust exactly the directly connected proxy hop). The app intentionally does not support blanket `trust proxy=true`, arbitrary CIDR chains, or hop counts greater than one. Set `TRUST_PROXY=1` only when the application is reachable exclusively through one controlled proxy that overwrites client-supplied `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host` headers. Do not expose the app port directly to the public internet in this mode.
- A private ClamAV daemon reachable from the application. Production document uploads fail closed when malware scanning is unavailable or not configured.

## 2. Configure secrets

Set these in the hosting provider's secret manager. Never commit real values to Git.

- `NODE_ENV=production`
- `PORT` to the port supplied by the host.
- `JWT_SECRET` to a cryptographically random value of at least 32 characters.
- `DATABASE_URL` to the managed PostgreSQL connection string.
- `CLAMAV_HOST` and `CLAMAV_PORT` for a private ClamAV daemon; set `CLAMAV_TIMEOUT_MS` to a bounded scan timeout. Never expose the scanner port publicly.
- `PGSSL_REJECT_UNAUTHORIZED=true` when the provider supplies a trusted TLS certificate.
- `PG_POOL_MAX` to a conservative connection count within the database plan.
- `METRICS_TOKEN` to a random bearer token if Prometheus scraping is enabled; `/metrics` is disabled when unset.
- `FREE_DAILY_MESSAGES` to the staging quota.
- One or more of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_GEMINI_API_KEY`.
- For the AI Engineer, set `BOTFORGE_GITHUB_TOKEN` to a fine-grained, repository-scoped token with Contents: read and Actions: read. Set `BOTFORGE_GITHUB_WRITE_TOKEN` separately only if draft PR creation is enabled; grant it Contents: read/write and Pull requests: read/write for this repository only. The dashboard requires a separate explicit confirmation before creating an isolated branch and draft PR. It never merges or deploys.
- Production is single-administrator only. Public signup, non-admin login, OAuth and self-service password recovery are disabled. Create the administrator out-of-band with `BOTFORGE_ADMIN_EMAIL` and the secure `npm run admin:create` command. Do not configure customer OAuth for this owner-only deployment.

Do not set `PGSSL=disable` for a public managed database. Do not expose provider keys or `DATABASE_URL` to browser code.

## 3. Prepare and migrate data

For an existing JSON installation:

1. Stop writes to the old instance and take a timestamped backup of `data/db.json`.
2. Keep the backup read-only and store a separate copy outside the application host.
3. Configure `DATABASE_URL` in a protected staging environment.
4. Run `npm ci --ignore-scripts`, then `npm run migrate:postgres -- --dry-run`. The committed `package-lock.json` is the source of truth for reproducible installs.
5. Review preflight counts and errors. Do not proceed if any record fails validation.
6. Run `npm run migrate:postgres` once.
7. Verify imported collection counts and the migration marker directly in PostgreSQL.
8. Start the app with the same `DATABASE_URL`. Startup creates the runtime repository and quota reservation table if absent.

The importer runs in one transaction and records a one-time marker. It does not copy original uploaded files. Do not delete or overwrite the JSON backup after migration.

For a fresh database, apply `migrations/001_initial_schema.sql` followed by `migrations/003_oauth_and_profile_memory.sql` using the database migration process, then start the app. The app creates the JSONB runtime repository, quota reservations, shared rate limits and webhook idempotency table during startup. `003` is required so OAuth-only accounts and account-wide memory notes can be represented in the normalized reporting tables.

For a reproducible local PostgreSQL staging rehearsal, copy `.env.example` to `.env`, set `POSTGRES_PASSWORD`, `JWT_SECRET` and `BOTFORGE_ADMIN_EMAIL`, then run `docker compose -f docker-compose.staging.yml up --build -d`. The app port is published on host loopback (`127.0.0.1:3000`) only, not on every network interface. Put a controlled reverse proxy on the same host in front of it; only then set `TRUST_PROXY=1`. Keep `TRUST_PROXY=0` when testing the app directly on loopback. Wait for the `botforge` service healthcheck, then run the staging smoke tests below. This stack is for staging only, not public production hosting. The staging compose stack includes a private ClamAV service; the first signature database update can delay readiness for scanning, so verify ClamAV is accepting connections before testing document uploads. The application rejects uploads with HTTP 503 if the scanner is unavailable and HTTP 422 if malware is detected.

## 3A. Zero-cost local development (no hosting or provider key)

This mode is for local feature development only. It does not create a public URL, persistent managed database, malware-scanning service or production deployment.

1. Install Node.js 20 or 22 on your development computer.
2. Clone the repository and run `npm ci`.
3. Copy `.env.example` to `.env`. Set `NODE_ENV=development`, a unique random `JWT_SECRET` (at least 32 characters), `BOTFORGE_ADMIN_EMAIL` to your own email, `BOTFORGE_ENABLE_MOCK_PROVIDER=true`, and `DATABASE_URL=` (blank uses local JSON development storage).
4. Run `npm run dev` and open `http://localhost:3000`.
5. Create an account through the development signup flow, create a bot using provider `mock`, and send a message. The mock returns a deterministic local test response and makes no external AI request or API charge.
6. Keep mock mode disabled in production. The server deliberately refuses the mock provider whenever `NODE_ENV=production`, even if the flag is accidentally set.

Do not use real customer data in local JSON mode. Document uploads require a working ClamAV daemon; skip upload testing in this no-service mode. PostgreSQL, backup/restore, HTTPS, email, OAuth, payments and production AI remain unverified until their services and credentials are provisioned.

## 4. Staging smoke tests

Before inviting users, verify all of the following:

- `GET /healthz` returns HTTP 200.
- `GET /readyz` returns HTTP 200 and reports `database: postgres`.
- Public signup returns HTTP 403, non-admin login returns HTTP 401, and social login is unavailable.
- The configured administrator can sign in, access the admin dashboard and use protected API routes.
- Non-administrator sessions and account records cannot access application pages or protected APIs.
- Document upload, retrieval citations and document deletion work for the owner only.
- Chat works with a real provider key; provider failures release quota reservations.
- Concurrent requests at the daily limit do not exceed the configured quota across multiple app instances.
- Bot deletion removes its dependent runtime records.
- Restart the app and confirm users, bots, documents, messages and usage remain available.

Use synthetic test accounts and non-sensitive documents only.

### Automated live preflight through GitHub Actions

The repository includes `.github/workflows/staging-smoke.yml`. After staging is deployed:

1. Add the exact HTTPS origin as a repository Actions secret named `BOTFORGE_STAGING_URL`. Do not add credentials or query parameters to this URL.
2. Open GitHub Actions → **BotForge live staging smoke** → **Run workflow**.
3. Confirm the workflow passes. It checks both health endpoints, PostgreSQL readiness and required reverse-proxy security headers without following redirects.
4. Save the workflow URL, tested commit and staging deployment ID in the release record.

This automated preflight is a narrow gate, not the complete auth/admin/upload/provider/restore/load or penetration-test rehearsal.

## 5. Backups and rollback

- Enable managed PostgreSQL automated backups and point-in-time recovery where available.
- Create an operator-side custom-format backup with `npm run backup:postgres` (requires PostgreSQL client tools and `DATABASE_URL`). The CI workflow also rehearses backup and restore against a disposable PostgreSQL database on every run.
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
- Configure `BOTFORGE_ADMIN_EMAIL` with the single reserved administrator email. Public signup cannot claim this address; provision the administrator using `npm run admin:create`. Only that configured email can access `/admin.html` and the `/api/admin` endpoints.
- Configure `BOTFORGE_PLANS_JSON` to override daily message quotas for Free, Plus and Pro. The defaults are intended for development and must be reviewed before commercial use.
- For Stripe subscriptions, configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` and `STRIPE_PORTAL_RETURN_URL`. Register `POST /api/billing/webhook` and subscribe to `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`. Test in Stripe test mode first.
- For India-focused Razorpay subscriptions, create recurring subscription plans in the Razorpay Dashboard and configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_PLUS`, `RAZORPAY_PLAN_PRO` and optionally `RAZORPAY_SUBSCRIPTION_TOTAL_COUNT`. Register `POST /api/billing/razorpay/webhook` in Razorpay and subscribe to subscription lifecycle events (at minimum activated, charged, updated, cancelled and completed). Verify test-mode UPI/card/netbanking checkout and webhook delivery before enabling live payments. Razorpay checkout uses hosted subscription links; actual payment methods depend on merchant account activation and Razorpay configuration.
- Users can manage opt-in automatic memory from the bot chat memory panel. It triggers an additional provider request after a chat turn; review provider cost and retention policies before enabling it broadly.

## 8. Owner-only AI Engineer CI diagnosis

The admin panel includes a read-only AI diagnosis action. To enable it, set `BOTFORGE_GITHUB_TOKEN` to a fine-grained token with Actions: read permission for the single repository, set `BOTFORGE_GITHUB_REPO=owner/repository`, and choose a configured `BOTFORGE_ENGINEER_PROVIDER` (`openai`, `anthropic` or `gemini`). The service reads recent workflow and failed-step metadata only, then asks the configured provider for a diagnosis. It does not fetch source code, workflow logs, create branches, edit files, open PRs, merge or deploy. Treat the result as a hypothesis and verify it against actual logs. Never grant this token write permissions for this read-only feature.

## 9. Password recovery email

To enable self-service customer password recovery, configure `RESEND_API_KEY`, `BOTFORGE_EMAIL_FROM` with a verified sender domain, and `PUBLIC_BASE_URL` with the HTTPS production origin. The app sends one-time reset links that expire after 20 minutes; only a SHA-256 token hash is stored, and a successful reset clears the failed-login lockout. Without these settings, the forgot-password endpoint deliberately returns a generic response and sends no email. Test delivery and expired/replayed links in staging before launch.

## 10. Prometheus alert rules

The repository provides starter alert rules at `deploy/prometheus-alerts.yml` for sustained HTTP 5xx rate, average request duration and process resident memory. Load the file with Prometheus `rule_files`, configure a scrape target for each BotForge instance, and set the scrape job label to include `botforge` for the target-down conventions used in your monitoring setup. If `METRICS_TOKEN` is configured, supply it through a protected bearer-token file in the Prometheus scrape configuration; never commit the token.

These rules only generate Prometheus alerts. Configure Alertmanager receivers, routing, grouping, inhibition and contact escalation in the deployment environment. The in-process counters are per application process and reset on restart; Prometheus rate/increase functions are used to tolerate counter resets. Tune thresholds against real staging traffic before production use.
