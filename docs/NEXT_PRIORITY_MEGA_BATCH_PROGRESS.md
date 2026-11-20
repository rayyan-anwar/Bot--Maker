# BotForge next-priority mega-batch progress

Updated: 2026-11-20

Percentages below are engineering estimates, not test coverage or a claim of production readiness.

| Priority | Estimated completion | Evidence in repository | Remaining gate |
|---|---:|---|---|
| Social Intelligence OAuth foundation | 25% | Platform capability catalogue, short-lived single-use state bound to user/platform, tests, official-API security specification | Persistent shared state, OAuth callbacks, PKCE, encrypted token vault/KMS, app credentials and platform review |
| AI Engineer approval-to-draft-PR | 75% | Admin-only control, kill switch, audit, allowlisted paths, isolated Docker syntax validation, one-time approval and draft PR flow tests | Real least-privilege GitHub app/token, real Docker staging, failure/replay drills |
| Knowledge Base citations | 75% | Unicode chunking, BM25/hybrid retrieval, stable document/chunk IDs, citation source deduplication and tests | Golden dataset evaluation, grounded-answer scoring, malware scanner staging and deletion tests |
| Fortisni UI and accessibility | 70% | Emotion engine, session continuity, chat lifecycle, visual state styles, browser tests and reduced-motion styling | Full device/browser QA, keyboard/screen-reader review and production visual review |
| Admin monitoring and alerting | 45% | Authenticated Prometheus metrics, request/error/duration and process memory gauges, diagnostics endpoint | External metrics scrape, alert rules, paging route, retention and incident rehearsal |
| Full application E2E tests | 50% | Browser tests for chat, Fortisni and AI Engineer; API integration/security tests | Full critical user journeys, payments, uploads/RAG, multi-tenant, browser matrix and load tests |
| PostgreSQL staging deployment | 35% | Dockerfile, PostgreSQL store/migrations, readiness endpoint, staging runbook, smoke-test script | Actual staging host, managed PostgreSQL, secrets, HTTPS, malware scanner and smoke run |
| Backup/restore/rollback verification | 30% | PostgreSQL backup/restore scripts and release checklist | Real scheduled backup, offsite retention, successful restore drill and rollback rehearsal |

## This batch implementation

- Social Intelligence provider catalogue and one-time user/platform-bound OAuth state foundation.
- Social Intelligence state and capability tests.
- RAG citation builder now preserves stable document and chunk identifiers, bounds excerpts, and removes duplicate/malformed source records.
- Prometheus metrics now expose resident memory and V8 heap gauges.
- Staging smoke utility checks both /healthz and /readyz, rejects insecure remote HTTP, and has a package command: npm run staging:smoke -- https://staging.example.com.
- Tests added for citation integrity, process memory metrics and staging readiness.

## Important limitations

Social OAuth is not live. The state store is process-local and is not suitable for multi-instance production use; replace it with a shared persistent, TTL-backed store before enabling real OAuth callbacks. No platform secrets, KMS, app approvals, production hosting or managed database credentials are assumed.

AI Engineer tests use mocked GitHub and Docker adapters. Passing tests validate workflow logic, not a real external GitHub PR or hardened production container.

The staging smoke command is implemented, but no real staging URL was supplied or deployed. Therefore staging, backups, restore and rollback remain unverified.
