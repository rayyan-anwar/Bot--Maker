# BotForge

BotForge is a self-hosted, single-administrator workspace for creating, configuring and chatting with custom AI bots. The production configuration is owner-only; public account registration, customer login and social sign-in are disabled.

> **Status:** Development / staging foundation. The upgrade branch has automated CI, but BotForge is **not production-certified or publicly deployed**. Real provider, OAuth, email, payment and managed-database integrations still require operator configuration and end-to-end testing.

## Current capabilities

- Single configured administrator identity with server-enforced owner-only access in production.
- Public signup, non-admin login, OAuth and self-service password recovery are disabled in production; test/development mode can exercise multi-account flows.
- Account lockout after three failed password attempts. Admin recovery is an out-of-band operator action.
- Custom bots with private instructions, owner-only editing and optional public discovery.
- Document uploads for TXT, Markdown and PDF, with file-size and extracted-text limits.
- Chat adapters for Anthropic Claude, OpenAI and Google Gemini. A provider must have a server-side API key configured.
- User-managed account-wide memory, per-bot memory notes and opt-in automatic memory extraction.
- Daily usage limits, usage records and configurable Free / Plus / Pro plans.
- PostgreSQL runtime storage and JSON-to-PostgreSQL import tooling; JSON storage remains the local development default.
- Stripe and Razorpay subscription foundations with signature verification and webhook event idempotency.
- Admin dashboard, heuristic source security scanner, AI Engineer proposal workflow and draft-PR creation.
- Docker staging configuration, health/readiness endpoints, backup/restore scripts and deployment documentation.
- Responsive interface with dark/light theme support.

## Requirements

- Node.js 18 or newer (Node.js 20 or 22 recommended).
- npm.
- An API key for at least one provider to use AI chat.
- PostgreSQL for persistent multi-instance staging or production-like testing.

## Run locally

1. Clone this repository and check out the intended branch.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env`.
4. Set a unique `JWT_SECRET` of at least 32 characters and configure `BOTFORGE_ADMIN_EMAIL`.
5. Create the administrator once with the secure bootstrap command below. Production login rejects every other account.
6. Configure at least one provider key:
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
   - `GOOGLE_GEMINI_API_KEY`
7. Start the app:
   ```bash
   npm start
   ```
8. Open `http://localhost:3000`.

The server refuses to start without a sufficiently long `JWT_SECRET`. In production or single-administrator mode, startup also fails unless `BOTFORGE_ADMIN_EMAIL` is a valid email address. This prevents an owner-only deployment from starting with an undefined administrator identity. Without `DATABASE_URL`, the app uses its JSON development store. Do not use that store for a public multi-instance service.

## Create the administrator

Set `BOTFORGE_ADMIN_EMAIL` and a temporary `BOTFORGE_ADMIN_PASSWORD` (16–128 characters) in a protected shell or secret manager, then run:

```bash
npm run admin:create
```

Remove the temporary bootstrap password immediately afterwards. The administrator role is derived from the configured email on the server. Do not create admin accounts through public signup. If admin password recovery is needed, use the documented operator reset procedure and a secure shell.

## Environment configuration

See [`.env.example`](.env.example) for the complete list. Common settings:

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Required signing secret, at least 32 characters |
| `BOTFORGE_ADMIN_EMAIL` | Single reserved administrator identity |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GEMINI_API_KEY` | Optional provider credentials; configure only providers you will enable |
| `DATABASE_URL` | Optional PostgreSQL connection; absent means JSON development storage |
| `FREE_DAILY_MESSAGES`, `BOTFORGE_PLANS_JSON` | Usage quota configuration |

| `STRIPE_* `, `RAZORPAY_* ` | Optional subscription billing configuration |
| `BOTFORGE_GITHUB_TOKEN`, `BOTFORGE_GITHUB_WRITE_TOKEN` | Optional AI Engineer GitHub integration; separate least-privilege tokens |

**Never commit secrets or put them in browser code, issue comments or chat.** Use the hosting provider's secret manager or protected environment variables.

## PostgreSQL staging

For an existing JSON dataset, back up `data/db.json` before migration. Configure `DATABASE_URL`, then review the [staging runbook](docs/STAGING_DEPLOYMENT_RUNBOOK.md) before running:

```bash
npm run migrate:postgres
```

The importer records a migration marker. Keep the original backup until row counts, application behavior and a restore drill have been verified. The migration does not transfer original uploaded files.

For local PostgreSQL staging, see `docker-compose.staging.yml` and the staging runbook. Do not treat the staging compose stack as a production deployment recipe.

## Tests and verification

```bash
npm test
node scripts/check-syntax.js
npm run security:scan
bash -n scripts/backup-postgres.sh scripts/restore-postgres.sh
```

GitHub Actions runs the test suite, syntax checks, heuristic security scan, production dependency audit and backup/restore shell checks. A green workflow only verifies the checks defined in CI; it is not a penetration test or production certification.

## AI Engineer safety boundary

The AI Engineer is admin-only and proposal-first. It can inspect CI metadata, request a bounded source-file proposal from a configured AI provider, and, after a separate explicit admin confirmation, create an isolated branch and draft pull request. It does **not** merge pull requests, deploy, run generated application code on the server or autonomously modify production. Review [AI Engineer operations](docs/AI_ENGINEER_OPERATIONS.md) and grant only the documented repository permissions.

## Documentation

- [Technical audit](docs/TECHNICAL_AUDIT.md)
- [Production roadmap](docs/PRODUCTION_ROADMAP.md)
- [Security and release checklist](docs/SECURITY_AND_RELEASE_CHECKLIST.md)
- [Staging deployment runbook](docs/STAGING_DEPLOYMENT_RUNBOOK.md)
- [AI Engineer specification](docs/AI_ENGINEER_SPEC.md)
- [AI Engineer operations](docs/AI_ENGINEER_OPERATIONS.md)
- [Product strategy](docs/PRODUCT_STRATEGY.md)
- [UI/UX specification](docs/UX_UI_SPEC.md)

## Known limitations before public launch

- No hosting, custom domain, production database, storage service or monitoring has been provisioned by this repository work.
- OAuth, email delivery, live AI provider calls and billing have not been end-to-end tested with operator credentials.
- PostgreSQL migration and runtime need a live managed-database rehearsal, concurrency testing and restore drill.
- **Rate limiting:** PostgreSQL deployments use the shared database-backed store for configured API counters; JSON-only local development uses an in-memory process-local store. The shared store still needs a live multi-instance staging and failover rehearsal before horizontal scaling.
- PDF parsing needs stronger resource isolation and malware scanning before accepting untrusted public uploads.
- The heuristic scanner is not a substitute for a professional security review.
- Privacy policy, terms, retention/deletion/export workflows, billing disclosures and ad-network integration need completion and review before a commercial launch.
- The current ad-related UI is placeholder-only; no ad network or revenue is connected.

## License

No license is currently declared. All rights are reserved unless a license is added by the repository owner.
