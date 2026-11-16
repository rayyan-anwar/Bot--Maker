# BotForge Technical Audit
**Repository:** `rayyan-anwar/Bot--Maker`  
**Audited baseline:** `main`, commit `3809808091d47d8ac7812a0f439beb9ecc8dcef7`  
**Date:** 16 November 2026  
**Scope:** All tracked application source files, frontend pages, package manifest and README. This is a source review, not a penetration test or a verified runtime test.

## Executive assessment

The repository is a small, understandable Node.js/Express MVP. It supports email/password accounts, bot CRUD, public bots, document uploads, keyword-based retrieval and Claude-backed chat. It is a useful prototype, but **it is not ready for public commercial production**.

The largest blockers are the JSON-file database, missing request throttling and usage accounting, insufficient upload/content controls, no automated tests, a single hard-coded model provider, and no production deployment/operations baseline.

## Findings

| Priority | Area | Finding | Consequence |
|---|---|---|---|
| Critical before launch | Persistence | `server/store.js` writes the entire JSON database synchronously and directly to one file. There is no transaction, file lock, atomic rename or multi-instance coordination. | Concurrent requests, crashes or multiple server instances can lose or corrupt data. |
| High | Data recovery | A JSON parse error is caught and replaced in memory with an empty database. A later write can overwrite the damaged file. | Silent loss of user, bot and conversation data. |
| High | Cost abuse | `server/chat.js` has no per-user quota, account spend cap or provider request rate limit. | One account or automated client can create an uncontrolled provider bill. |
| High | Authentication | Signup/login use synchronous bcrypt calls and have no visible IP/account login throttling. | Event-loop blocking and brute-force/credential-stuffing exposure. |
| High | Upload security | `server/documents.js` checks the filename extension, but not file signatures or extracted-text limits. PDF parsing has no explicit page/text ceiling or worker isolation. | Spoofed files, parser resource exhaustion and oversized stored documents. |
| High | API resource controls | JSON body size is not explicitly bounded; chat input length and total stored history are not bounded. | Memory/CPU/storage exhaustion and unexpectedly large provider requests. |
| High | Error handling | Provider errors are returned to the client using the upstream error message. | Provider/internal details may be exposed; error responses are not normalized. |
| Medium | Authorization/privacy | Public bot serialization includes the creator's full system instructions. | A creator's proprietary prompt may be disclosed when a bot is public. Decide explicitly whether prompts are public. |
| Medium | CSRF | Authentication is cookie-based. SameSite=Lax is helpful, but there is no explicit Origin/Referer validation or CSRF token strategy for state-changing routes. | Cross-site request risk depends on deployment and browser context. |
| Medium | Validation | Several update paths call `.trim()` on values without consistently checking their types. | Malformed JSON can produce 500 errors. Boolean fields are coerced with `!!value`. |
| Medium | Retrieval quality | `server/retrieval.js` uses English-centric tokenization and raw word overlap. There are no embeddings, reranking, citations or retrieval evaluation tests. | Weak multilingual retrieval and irrelevant context. |
| Medium | Prompt injection | Retrieved document text is concatenated into the system prompt without a clear untrusted-data boundary or injection policy. | Instructions inside uploaded documents may influence model behavior. |
| Medium | Observability | No structured request logs, trace IDs, provider latency/token/cost metrics or operational health checks are present. | Hard to investigate failures or understand unit economics. |
| Medium | Frontend | The UI is a basic server-served HTML/CSS/JS experience. It has no shared design system, explicit theme preference, loading/empty/error patterns across all views, or accessibility review. | Product feels like an MVP and is harder to evolve. |
| Medium | Delivery quality | No test script, test suite, CI workflow, dependency scanning or release process is defined. | Regressions and unsafe releases can reach users. |
| Medium | Operations | No Docker setup, migration framework, backup/restore procedure or deployment runbook. | Deployments and recovery are fragile. |

## File-by-file review

- `server/index.js`: minimal Express boot; no explicit JSON size limit, security headers, request IDs, rate-limit middleware, health endpoint or graceful shutdown.
- `server/auth.js`: basic email/password/JWT flow; synchronous bcrypt; no login/signup throttling; no email verification, reset flow, session revocation or CSRF/Origin defense.
- `server/bots.js`: owner checks exist. Input types and patch validation need hardening. Public bot payload currently includes instructions.
- `server/chat.js`: Anthropic-only; no provider abstraction, quotas, per-plan limits, timeout/retry policy, cost accounting or maximum prompt size. User message is persisted before provider success, leaving failed user turns in history.
- `server/documents.js`: extension-only validation; extraction and storage are synchronous/monolithic for some paths; extracted content size and PDF complexity are not capped; no upload quota.
- `server/retrieval.js`: keyword matching only; English-centric tokenization; no vector index, metadata filters, citation references or evaluation harness.
- `server/store.js`: single-process JSON cache and whole-file synchronous writes; no atomicity, transactions, locking, migrations or backup strategy.
- `public/index.html`, `dashboard.html`, `bot.html`, `css/style.css`, `js/api.js`: functional baseline but limited interaction states, theme support, responsive refinements, component reuse and accessibility coverage.
- `package.json`: no test/lint scripts and no production toolchain. Dependencies should be audited and pinned via a lockfile.

## Recommended remediation order

1. **Before any public beta:** move persistence to PostgreSQL; add migrations; add rate limits and quota enforcement; cap request/upload/extracted-text sizes; normalize errors; add security headers and CSRF/Origin protections; add tests.
2. **Before paid plans:** provider abstraction, token/cost metering, user-level and workspace-level budgets, idempotent billing events, payment webhook verification and audit logs.
3. **Before scale:** background job queue for ingestion, object storage, vector database/pgvector, caching, observability, backups with restore drills and horizontal deployment.
4. **Before enterprise:** RBAC, SSO, tenant isolation tests, retention controls, export/delete workflows, audit trails, data-processing terms and independent security review.

## Verification status

The GitHub source tree was inspected. This review does not claim that the application was installed, run, load-tested, penetration-tested or deployed. Do not describe the current code as production-secure until those checks have been completed.
