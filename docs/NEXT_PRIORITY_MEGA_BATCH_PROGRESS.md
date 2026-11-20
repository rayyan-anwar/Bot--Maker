# BotForge next-priority mega-batch progress

Updated: 2026-11-20

Percentages below are engineering estimates, not test coverage or a claim of production readiness.

| Priority | Estimated completion | Evidence in repository | Remaining gate |
|---|---:|---|---|
| Social Intelligence OAuth foundation | 45% | Authenticated platform/state APIs, persistent single-use user/platform-bound state, S256 PKCE, AES-256-GCM token envelopes, owner-scoped encrypted connection lifecycle, unit/API/PostgreSQL tests | Provider-specific authorization URLs/callbacks, token exchange/refresh/revocation, KMS-backed rotation, app credentials and platform review |
| AI Engineer approval-to-draft-PR | 75% | Admin-only control, kill switch, audit, allowlisted paths, isolated Docker syntax validation, one-time approval and draft PR flow tests | Real least-privilege GitHub app/token, real Docker staging, failure/replay drills |
| Knowledge Base and ingestion | 80% | Unicode chunking, BM25/hybrid retrieval, stable document/chunk IDs, citation source deduplication, exact-content duplicate prevention, per-bot document and text-capacity limits, PDF worker isolation and upload safety tests | Golden dataset evaluation, grounded-answer scoring, malware scanner staging and deletion tests |
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

Social OAuth is not live. Persistent state and encrypted connection storage now use the shared application store, but provider-specific authorization/callback/token exchange and revocation are not yet implemented. AES-256-GCM requires BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY; production should source and rotate this key through a managed KMS/secret manager. No platform app approvals or customer-connected accounts are assumed.

AI Engineer tests use mocked GitHub and Docker adapters. Passing tests validate workflow logic, not a real external GitHub PR or hardened production container.

The staging smoke command is implemented, but no real staging URL was supplied or deployed. Therefore staging, backups, restore and rollback remain unverified.


## Follow-up hardening

- Fixed the PostgreSQL collection constraint to include `socialConnections`; both CI workflows for the fix passed, including PostgreSQL 16 integration.
- Knowledge Base uploads now reject exact duplicate extracted content per bot and enforce a maximum of 50 documents and 5 million extracted characters per bot. The per-file limits remain 5 MB upload and 1 million extracted characters.
- Added unit coverage for stable content hashes, duplicate detection inputs and capacity boundaries. CI for this follow-up is pending.
