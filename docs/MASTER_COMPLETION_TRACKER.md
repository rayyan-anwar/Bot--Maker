# BotForge Master Completion Tracker

**Repository:** `rayyan-anwar/Bot--Maker`  
**Baseline:** `3709635f028b7e29fa8c66e6b845e07f1af793e6`  
**Last reconciled:** 2026-11-25 (after PR #132; PR #129–#132 and current launch gates reconciled)
**Purpose:** One evidence-led view of implementation, automated verification, and release blockers.

## Status definitions

- **Implemented:** Relevant code or documentation exists in the repository.
- **Automated-tested:** A test or CI job verifies the stated behavior. This does not prove live deployment behavior.
- **Partial:** A foundation exists, but material functionality or verification remains.
- **External validation required:** Needs real credentials, infrastructure, operators, provider approval, or physical devices.
- **Not certified:** Do not describe as production-ready until the release acceptance checklist is evidenced.

Do not calculate a project-wide percentage by counting files, commits, PRs, or checklist bullets. The work items have different scope and risk. A percentage is publishable only after task weights, evidence, and exclusions are agreed and kept current.

## P0 — Release safety and integration

| Work item | Status | Evidence / exit condition |
|---|---|---|
| Required CI on exact release SHA | Main-commit CI verified; release-tag verification remains | PRs #114/#115 enable Full Chat, Fortisni and Admin browser E2E on main pushes; exact main SHA `bfec26d6006f18d8f8577e0370a7978e80197fdf` passed BotForge CI, Node 18/20/22, PostgreSQL 16, Docker and all three browser suites |
| Full signup-to-chat browser journey | Automated-tested on main commit | Full Chat Browser E2E passed on exact main SHA `bfec26d6006f18d8f8577e0370a7978e80197fdf`; repeat for each release candidate |
| Admin controls browser journey | Automated-tested on main commit | AI Engineer Admin Browser E2E passed on exact main SHA `bfec26d6006f18d8f8577e0370a7978e80197fdf`; repeat for each release candidate |
| Fortisni browser behavior | Automated-tested on main commit; device QA required | Fortisni Chromium E2E passed on exact main SHA `bfec26d6006f18d8f8577e0370a7978e80197fdf`; physical browser/OS/device matrix remains |
| Dependency and source security scans | Automated-tested on main commit; review required | `npm audit`/source security scan passed in main-commit CI; review and disposition every high/critical finding before release |
| PostgreSQL migration and concurrency | Automated-tested on main commit; staging validation required | PostgreSQL 16 migration, concurrency and integration suite passed on exact main SHA; require staging migration and recovery evidence |
| Backup and restore | CI rehearsal passed; staging validation required | PostgreSQL backup/restore rehearsal into disposable databases passed on exact main SHA; restore into clean staging DB and record RPO/RTO |
| Production deployment | External validation required | No production URL or operator evidence recorded in this tracker |
| Rollback and incident response | External validation required | Runbook and operator rehearsal required |

## P1 — Core product

| Work item | Status | Evidence / exit condition |
|---|---|---|
| Bot create, configure, edit and delete | Implemented; automated-tested | PR #106 adds JSON atomicity regression coverage; PR #112 verifies PostgreSQL create+history transaction, rollback on version insert failure and concurrent stale-write conflict. Full owner journey and malformed-input coverage remain ongoing |
| Public bot discovery and safe public view | Implemented baseline; privacy boundaries automated-tested | PR #109 adds bounded search/pagination, owner/private filtering, input validation and dashboard search/load-more. PR #110 moves filtering, sorting, LIMIT/OFFSET and total count into PostgreSQL. PR #111 verifies private instructions, API/provider secrets and owner knowledge documents are not exposed or mutable by visitors. Query indexes, abuse controls and production-scale testing remain |
| Chat with supported providers | Implemented; live validation required | Anthropic, OpenAI and Gemini adapters/tests exist; verify real credentials, timeouts, limits and provider errors |
| Conversation history and memory | Partial; privacy guard automated-tested | User-scoped routes and deletion exist; PR #108 adds server-side filtering for common sensitive automatic-memory candidates plus unit and authenticated chat integration tests. Pattern filtering is not exhaustive; inspect/edit/disable/delete, retention and cross-account isolation still need broader verification |
| Knowledge uploads and retrieval | Partial | Upload/retrieval tests exist; verify malware scanning, parser limits, citations, prompt-injection resistance and deletion |
| Usage quotas and AI spend budget | Implemented foundation; live validation required | Ledger/reservation tests exist; validate real model pricing and reconciliation before enabling |
| Billing foundations | Implemented foundation; external validation required | Stripe/Razorpay signature and idempotency tests exist; PR #124 adds a shared five-attempt/hour per-account checkout limiter backed by PostgreSQL when configured. Perform provider sandbox checkout, refunds and entitlement tests |
| Responsive UI and themes | Implemented foundation; device QA required | PWA/theme tests exist; verify real mobile and desktop browsers |

## P2 — Fortisni companion

| Work item | Status | Evidence / exit condition |
|---|---|---|
| Text-driven emotion/reaction engine | Implemented foundation; precision improved | PR #107 adds Roman Hindi word-boundary matching, dedicated warm visual state and preserves user emotion during response preparation. PR #113 adds English/Hindi/Hinglish negation-aware matching with unit and Chromium tests; broader contextual/ambiguous-input coverage remains |
| Affection reaction consistency | Implemented; automated-tested | PR #104 aligns server/browser affection precedence; PR #107 fixes warm-state mapping and chat-state override; all required CI and browser E2E checks passed on PR #107 head SHA |
| Voice input/output | Implemented browser foundation; device QA required | Browser speech tests exist; confirm browser permissions, locale, unsupported states and disclosure |
| Image/vision flow | Implemented foundation; live provider validation required | Authenticated upload/analyze and temporary chat-context handoff are in mainline; verify provider credentials, limits and real device behavior |
| Persistent companion personality and long-context continuity | Partial | Validate session boundaries, reset behavior, privacy and context relevance |
| Smartwatch companion | Specification only | Native watch app, phone pairing, notifications and device testing are not certified as implemented |

## P3 — Advanced platform capabilities

| Work item | Status | Evidence / exit condition |
|---|---|---|
| Agent Lab planning and durable task execution | Implemented foundation; operational validation required | Unit/integration tests exist; validate worker lifecycle, restarts and real queue operation |
| AI Engineer proposal and draft-PR workflow | Implemented guarded foundation; sandbox validation required | Approval, write-guard and draft-PR tests exist; validate isolated worker resource/network restrictions |
| Social intelligence / OAuth | Partial | Route and persistence tests exist; real OAuth provider setup, callbacks, token rotation and app review remain |
| Automation and integrations | Partial | Reliability and ownership tests exist; verify each external integration with real accounts |
| Monitoring and alert rules | Starter implementation | Prometheus alert rules and metrics tests exist; monitoring stack and alert delivery are not confirmed deployed |
| Multi-tenant commercial SaaS | Partial | Tenant isolation and plan foundations exist; validate complete signup, roles, billing and data lifecycle before enabling public registration |

## P4 — External launch and scale

- [ ] Provision isolated staging environment with HTTPS and managed PostgreSQL.
- [ ] Configure secret manager, unique production JWT secret and administrator identity.
- [ ] Execute release acceptance checklist and attach dated evidence.
- [ ] Run clean-database backup/restore rehearsal and record RPO/RTO.
- [ ] Verify provider sandbox and payment sandbox workflows.
- [ ] Perform independent security review and remediate critical/high findings.
- [ ] Run representative load test and establish capacity limits.
- [ ] Complete privacy, retention, export and deletion review.
- [ ] Verify operator monitoring, alert routing and rollback.
- [ ] Obtain explicit release decision from the responsible operator.

## Current integration queue

1. **PR #104 merged:** Fortisni affection reaction consistency. BotForge CI, Fortisni Browser E2E and Full Chat Browser E2E passed on the exact PR head SHA.
2. **PR #106 merged:** Bot creation plus initial history is atomic; edit, restore, publish and unpublish use version-checked atomic persistence in the JSON and PostgreSQL adapters. Node.js 18/20/22, PostgreSQL 16 integration, Docker readiness, security scan and Full Chat Browser E2E passed on the exact PR head SHA.
3. **PR #107 merged:** Fortisni Roman Hindi/Hinglish affection matching now uses word boundaries; dedicated warm visual state is preserved; emotional user reactions are not overwritten by generic thinking state. Node.js 18/20/22, PostgreSQL 16, Docker, Full Chat Browser E2E and Fortisni Chromium E2E passed on its exact head SHA.
4. **PR #108 merged:** Automatic memory candidates now pass a server-side defense-in-depth filter for common health, religion, politics, sexuality, identity, credential, government/financial identifier and contact-data patterns. Manual user-entered memory remains unchanged. Node.js 18/20/22, PostgreSQL 16, Docker, security scans and Full Chat Browser E2E passed on the exact PR head SHA.
5. **PR #109 merged:** Public bot discovery supports validated search and bounded pages, dashboard search/load-more, owner exclusion and private-bot exclusion. Node.js 18/20/22, PostgreSQL 16, Docker and Full Chat Browser E2E passed on the exact PR head SHA.
6. **PR #110 merged:** PostgreSQL now performs public-bot filtering, sorting, search, LIMIT/OFFSET and total counting in the storage query; JSON development adapter behavior remains aligned. Node.js 18/20/22, PostgreSQL 16 integration, Docker and Full Chat Browser E2E passed on the exact PR head SHA.
7. **PR #111 merged:** Public bot responses are regression-tested against leakage of owner instructions, owner IDs, API/provider secrets, internal prompts/notes and knowledge documents. Visitors are denied document listing, reindexing and deletion. Node.js 18/20/22, PostgreSQL 16, Docker and security scans passed on the exact PR head SHA.
8. **PR #112 merged:** PostgreSQL integration now verifies atomic bot creation plus version history, rollback when history insertion fails, and concurrent version-checked edits. Node.js 18/20/22, PostgreSQL 16, Docker and security checks passed on the exact PR head SHA.
9. **PR #113 merged:** Fortisni now masks common negated English, Roman Hindi and Devanagari emotion phrases before classification, preserves contrastive clauses such as “not sad but happy,” and recognizes excitement on the server. Node.js 18/20/22, PostgreSQL 16, Docker, Fortisni Chromium E2E and Full Chat Browser E2E passed on the exact PR head SHA. This remains a rule-based heuristic, not full semantic/sarcasm understanding.
10. Continue P0/P1 source review and select the next code batch from verified gaps, not feature-count pressure.
11. **PR #114 merged:** Full Chat Browser E2E and Fortisni Browser E2E now run on pushes to `main`.
12. **PR #115 merged:** AI Engineer Admin Browser E2E now runs on pushes to `main`. Exact main SHA `bfec26d6006f18d8f8577e0370a7978e80197fdf` passed BotForge CI (Node.js 18/20/22, PostgreSQL 16, Docker, security scan and backup/restore rehearsal), Full Chat Browser E2E, Fortisni Chromium E2E and Admin Browser E2E.
13. Keep infrastructure/device/provider-dependent work explicitly blocked until access and evidence are available.




17. **PR #124 merged:** Stripe and Razorpay checkout routes now share a five-attempt-per-hour limit per authenticated account. PostgreSQL-backed rate-limit storage is used when PostgreSQL is active, sharing the limit across instances. Route regression coverage verifies the sixth Stripe checkout attempt returns HTTP 429. Exact PR head SHA `e3e8838035c24168957a9b7308a5549a4b55d599` passed Node.js 18/20/22, PostgreSQL 16 integration, Docker build and Full Chat Browser E2E.

16. **PR #121 merged:** PDF parsing now permits at most two concurrent parser workers per application process and rejects excess work with HTTP 503. Parser slots are released on completion, error, timeout and worker-construction failure; capacity/overload/slot-reuse tests were added. Exact PR head SHA `f78d16071033478cb48001d7c6575518a9f8ce9a` passed Node.js 18/20/22, PostgreSQL 16 integration, Docker build and Full Chat Browser E2E. This is a per-process guard, not OS/container isolation or multi-instance capacity certification.

15. **PR #118 merged:** Streaming chat now aborts the upstream provider request when the SSE client disconnects. Caller cancellation is propagated into the provider fetch; quota reservations are released when cancellation occurs before provider work starts, while post-start AI budget holds remain for reconciliation because partial provider cost may have been incurred. Exact PR head SHA `00579500f45dddd283e7e98e308f1e00d59cb2b8` passed Node.js 18/20/22, PostgreSQL 16 integration, Docker build and Full Chat Browser E2E. Main-branch post-merge checks were queued at checkpoint time.

14. **PR #116 merged:** Chat response-style and safety-mode prompt suffixes now use actual newline separators; extracted prompt construction into a pure helper and added regression coverage for concise, detailed, strict, basic and default modes. Exact PR head SHA `70491f121625681f44823f8352fe52e695a27b92` passed Node.js 18/20/22 verification, PostgreSQL 16 integration, Docker image build and Full Chat Browser E2E. Main-branch post-merge workflows were still running at tracker reconciliation; no live provider or production behavior is implied.

## Release authority

The [release acceptance checklist](RELEASE_ACCEPTANCE_CHECKLIST.md) is the controlling gate. A green CI build is necessary, not sufficient. A feature may be implemented and automated-tested while the overall product remains not production-certified.


## Verified integration checkpoint — 2026-11-24

- `main` includes PR #104 at merge commit `50aed403c26f6bc9f0caafe8f9eeed48fb7e3d80` and PR #106 at merge commit `9867ddb7916cf9fda9e2defcb824f12d7dd7edc0`.
- PR #106's exact head SHA `f7b92b5c767bf87e90a2de483c83f549b7bda866` passed Node.js 18, 20 and 22 test/syntax/security checks, PostgreSQL 16 integration including backup/restore rehearsal, Docker build/readiness, and Full Chat Browser E2E.
- These results validate the tested commit and automated environment only. They do not establish live provider credentials, production deployment, production monitoring, real-device behavior or production certification.

- PR #107 exact head SHA `00ba7089d562a4c20313fe2139cf2ddf28f0c76b` passed Node.js 18/20/22 tests, syntax/security checks, PostgreSQL 16 integration and backup/restore rehearsal, Docker readiness, Full Chat Browser E2E, and Fortisni Chromium E2E.

- PR #108 exact head SHA `75d653e483d42470a123f8ca60139e9ba216b0f0` passed Node.js 18/20/22 tests, syntax/security checks, PostgreSQL 16 integration including backup/restore rehearsal, Docker readiness, and Full Chat Browser E2E. Its integration test verifies sensitive AI-generated memory candidates are dropped while a safe preference is retained.

- PR #109 exact head SHA `f96b0b2405c16fa56c86eddaa398bda0231a7ddf` passed Node.js 18/20/22 tests, syntax/security checks, PostgreSQL 16 integration including backup/restore rehearsal, Docker readiness and Full Chat Browser E2E.

- PR #110 exact head SHA `0986817d179e186285ef6a679052389b78d4b06e` passed Node.js 18/20/22 tests, syntax/security checks, PostgreSQL 16 integration including the new public-discovery pagination test and backup/restore rehearsal, Docker readiness and Full Chat Browser E2E.

- PR #111 exact head SHA `27d139082d997d5c4c55e5bb9ab6be9353b7a416` passed Node.js 18/20/22 tests, syntax/security checks, PostgreSQL 16 integration including backup/restore rehearsal and Docker build/readiness. This was a test-only security-boundary change; Full Chat Browser E2E was not required by its changed paths.

- PR #112 exact head SHA `ecb7d23b2abb7da6c9a552f14e04a807cea88ca7` passed Node.js 18/20/22 tests, syntax/security checks, PostgreSQL 16 integration including atomic bot rollback/concurrency and backup/restore rehearsal, and Docker build/readiness.

- PR #113 exact head SHA `1d033d1f4d9400f5cc854f995725edcff75aef17` passed Node.js 18/20/22 tests, syntax/security checks, PostgreSQL 16 integration including backup/restore rehearsal, Docker readiness, Fortisni Chromium E2E and Full Chat Browser E2E.

- Main commit `56042cf635e3391c1a1cab0821bd9fb99a172343` passed BotForge CI run `45373812123`, Full Chat Browser E2E run `45373812187`, and Fortisni Browser E2E run `45373812050`. These are post-merge main-commit results, not a production deployment or release certification.

- Main commit `bfec26d6006f18d8f8577e0370a7978e80197fdf` passed BotForge CI run `45374327630`, Full Chat Browser E2E run `45374327505`, Fortisni Browser E2E run `45374327815`, and AI Engineer Admin Browser E2E run `45374327841`. These are post-merge main-commit results, not production deployment or release certification.

- Main commit `bfec26d6006f18d8f8577e0370a7978e80197fdf` passed BotForge CI run `45374327630`, Full Chat Browser E2E run `45374327505`, Fortisni Browser E2E run `45374327815`, and AI Engineer Admin Browser E2E run `45374327841`. These are post-merge main-commit results, not production deployment or release certification.

- PR #116 exact head SHA `70491f121625681f44823f8352fe52e695a27b92` passed all six PR checks: Node.js 18/20/22, PostgreSQL 16 integration, Docker image build and Full Chat Browser E2E. It was squash-merged to `main` as `fae9792bb4549f7e89e6ca6af417d30f2e8ff08c`. Post-merge main-branch workflows were initiated and were still running when this checkpoint was written.

- Production-hardening issue #3 was reconciled against main: automated proxy spoof-resistance/topology tests are present in `tests/proxy-trust.test.js`; 40-way concurrent shared PostgreSQL rate-limit increments are covered in `tests/postgres.integration.test.js`. Issue #3 now marks those repository-verifiable tasks complete. Real reverse-proxy, HTTPS/cookie behavior and multi-instance staging validation remain open.

- PR #118 exact head SHA `00579500f45dddd283e7e98e308f1e00d59cb2b8` passed all six PR checks: Node.js 18/20/22, PostgreSQL 16 integration, Docker image build and Full Chat Browser E2E. It was squash-merged to `main` as `a4d347dca643a9c7a2d348df0b29e7b63a622136`. Main-branch post-merge checks were queued when this checkpoint was written.

- Main commit `e40073d77b2c47fe36a0e64ecbaf78e3171a92f9` passed all nine post-merge checks after PR #118 and tracker PR #119: Node.js 18/20/22, PostgreSQL 16 integration, Docker image build, Full Chat Browser E2E, Fortisni Chromium E2E, AI Engineer Admin Browser E2E and workflow generation. This validates this main commit in CI only, not a live deployment.

- Main commit `223b18945279f7edfe16eaea9ff1284755c7ecd2` passed all nine post-merge checks after PR #121: Node.js 18/20/22, PostgreSQL 16 integration, Docker image build, Full Chat Browser E2E, Fortisni Chromium E2E, AI Engineer Admin Browser E2E and workflow generation. CI success does not establish staging or production behavior.

- Documentation PR #122 merged tracker reconciliation for PR #121. Main commit `223b18945279f7edfe16eaea9ff1284755c7ecd2` passed all nine post-merge CI checks after the PDF parser concurrency hardening. The current baseline is the subsequent documentation-only main commit `797234fd3d7ffec049d2292249b9f9c181653dee`.

- Main commit `c664957ab6598ea9c8443878b215e0d1bc3dedd8` passed all nine post-merge checks after PR #124: Node.js 18/20/22, PostgreSQL 16 integration, Docker image build, Full Chat Browser E2E, Fortisni Chromium E2E, AI Engineer Admin Browser E2E and workflow generation. This is CI evidence, not live billing or production validation.


## Verified main checkpoint — 2026-11-25

- Current `main` SHA: `3709635f028b7e29fa8c66e6b845e07f1af793e6`.
- PR #132 is merged. It adds regression coverage for all six supported process-execution APIs detected by the heuristic scanner: `exec`, `execSync`, `spawn`, `spawnSync`, `execFile` and `execFileSync`.
- Post-merge CI on the exact current main SHA passed **9/9**: Node.js 18, Node.js 20, Node.js 22, PostgreSQL 16 integration, Docker image build, workflow generation, Full Chat browser flow, Fortisni Chromium flow and Admin control flow.
- PR #129 staging hardening, PR #130 scanner regression tests and PR #131 process-execution detection fix are already in the mainline history; PR #132 completes API-by-API scanner regression coverage.
- The scanner is heuristic review tooling. Its findings are not a penetration test and absence of findings is not proof of safety.

## Current open release blockers — reconciled 2026-11-25

### Issue #3 — trusted proxy and edge security (OPEN)
Repository-verifiable work already present:
- [x] Spoofed `X-Forwarded-For` tests with `TRUST_PROXY=0`.
- [x] One-hop trust configuration and rejection of ambiguous/blanket trust values.
- [x] Middleware-ordering regression coverage.
- [x] Shared PostgreSQL rate-limit concurrency coverage, including 40 concurrent increments.

Still pending in a real staging topology:
- [ ] Verify the proxy overwrites forwarded headers and the application is not publicly reachable around the proxy.
- [ ] Exercise auth/API rate limits through the actual reverse proxy and at least two app instances.
- [ ] Verify secure cookies, Origin/CSRF enforcement and HTTPS redirects behind the actual proxy.
- [ ] Attach dated staging evidence before enabling public traffic.

### Issue #2 — staging rehearsal and production operations (OPEN)
- [ ] Provision private HTTPS staging host and managed PostgreSQL with TLS.
- [ ] Configure secrets through the host secret manager; create the single administrator securely. Never put credentials in Git or chat.
- [ ] Provision private ClamAV and verify signature readiness/fail-closed upload behavior.
- [ ] Rehearse migrations with synthetic data and verify counts/markers.
- [ ] Run staging auth/admin/chat/provider/upload/deletion/restart-persistence smoke tests.
- [ ] Validate quota and shared rate limits across multiple app instances.
- [ ] Enable managed backups and restore into a separate clean staging database; record recovery evidence/RPO/RTO.
- [ ] Verify secret rotation, log redaction, metrics, alerts, incident response and rollback.
- [ ] Complete browser E2E, representative load testing and independent security review.
- [ ] Verify provider and payment sandbox flows, including billing webhooks/refunds/entitlements.
- [ ] Review privacy, terms, retention/export/deletion and billing disclosures with qualified counsel.
- [ ] Confirm PDF parser OS/container sandboxing and malware scanning in the actual staging runtime.

### Product and scale work still not release-certified
- [ ] Complete remaining security checklist review: auth/session lifecycle, CSRF/Origin, tenant isolation across all routes, upload storage/deletion, prompt-injection/tool threat model, spend ceilings and data lifecycle.
- [ ] Validate live AI provider behavior and real model cost/quota reconciliation.
- [ ] Validate Stripe/Razorpay sandbox checkout, webhook idempotency, cancellation, refunds and entitlement revocation.
- [ ] Validate Fortisni on a representative physical mobile/desktop browser and OS matrix; smartwatch support remains specification-only.
- [ ] Validate AI Engineer sandbox restrictions and failure recovery in a disposable worker with no production secrets/database access.
- [ ] Complete monitoring/alert delivery, operational rollback and independent penetration/load testing.

## Progress reporting rule

Do not publish a single exact completion percentage from commit count or checklist item count. The current repository state has a green 9/9 main CI suite and substantial implemented/tested foundations, but the product is **not production-certified**. The open issues #2 and #3 are intentional release gates because their remaining tasks require real infrastructure, credentials and operator evidence. Recalculate a percentage only from a weighted, scoped work breakdown with explicit exclusions (for example, production launch vs. full long-term roadmap).


## Verified integration checkpoint — 2026-11-25 (PR #134)

- PR #134 merged to `main` at commit `0e30c69ed33f43b767e6968db31f9b877b9cbbf1`.
- Added `tests/password-reset-token.test.js`: concurrent token consumption allows exactly one successful reset; replayed and expired tokens are rejected; successful consumption clears reset-token fields and increments `sessionVersion` to revoke existing sessions.
- Exact PR head SHA `1df4ee9395f2f1ab840ea649e8f406f9f7128f85` passed all five PR checks: Node.js 18, Node.js 20, Node.js 22, PostgreSQL 16 integration and Docker image build.
- Post-merge main-commit CI for `0e30c69ed33f43b767e6968db31f9b877b9cbbf1` was still running at this checkpoint; record its final result only after verification.
- This is regression coverage for reset-token lifecycle and session revocation. It does not validate live email delivery, production rate limiting or staging deployment.


## Verified integration checkpoint — 2026-11-25 (PR #136)

- PR #135 merged the preceding tracker reconciliation at main commit `1bb733bc743f2a6cf7d20f7b6f9c310f61cdaa0f`.
- PR #136 merged at commit `0ad03a272cf53412dfbc00bac1155625aee72bdf`.
- Password reset page now captures the one-time token and immediately calls `history.replaceState` to remove the query string from the visible URL and current browser-history entry. The captured token remains available for the reset POST.
- Added a regression test that checks token capture, URL cleanup ordering, and continued submission after cleanup.
- Exact PR head SHA `19c9cf268e596129f9cad7840948a73defc1bc10` passed all six checks: Node.js 18/20/22, PostgreSQL 16 integration, Docker image build and Full Chat browser flow.
- Post-merge main CI for `0ad03a272cf53412dfbc00bac1155625aee72bdf` was queued at this checkpoint; record final results only after verification.
- This reduces exposure in the visible URL/history. It does not remove the token from the initial HTTP request, email, browser extensions or server-side logging, and does not replace HTTPS or short-lived single-use token controls.


## Verified checkpoint — 2026-11-25 (password-reset transport protections)

- PR #138 merged to `main` at `9e7d7057b442cc056a3ae542c116734d424e29be`.
- The reset page sets `Referrer-Policy` via a strict `no-referrer` meta policy, preventing the one-time reset token in the initial URL from being forwarded in subsequent `Referer` headers.
- The reset page response is served with `Cache-Control: no-store, max-age=0` and `Pragma: no-cache` before static-file handling.
- Regression tests cover both the referrer policy and cache-prevention headers. All six PR checks passed on head `da1d6db7cbf98884d52a9359a8f690ce6569c4ac`.
- Post-merge main CI passed all nine checks on merge commit `9e7d7057b442cc056a3ae542c116734d424e29be`: Node.js 18/20/22, PostgreSQL 16 integration, Docker image build, Full Chat browser flow, Fortisni Chromium flow, workflow generation and Admin control flow.
- This does not remove the token from the initial request URL, email URL, browser extensions or server-side request logs. Those require separate controls.

## Verified checkpoint — 2026-11-25 (production cookie regression coverage)

- Added regression assertions for production session cookies: `Secure`, `HttpOnly` and `SameSite=Strict`.
- Added an explicit assertion that a production cookie-authenticated mutation without an `Origin` header is rejected.
- These assertions verify the application middleware and cookie configuration in tests. They do not replace a real HTTPS reverse-proxy staging test.
