## Verified integration checkpoint — 2026-11-28 (PR #159–#162)

- PR #159 merged as `816f212c50e5f4ac06e95c5f2527d4452ffcef4f`: staging smoke utility verifies PostgreSQL readiness and required security headers.
- PR #160 merged as `085021256bf1bf5da8904868f87c6aae12b8f237`: manual GitHub Actions staging preflight workflow and operator runbook.
- PR #161 merged as `c4a5dfb9137c36917cb537560d1c956844f9d272`: Render free-staging Blueprint committed; its infrastructure plan is not provisioned.
- PR #162 merged as `a82c6579ffc0308305e7f73ac47dd895ec82c093`: account-wide personal AI memory can now be edited from the dashboard; owner-scoped PATCH API, duplicate/length validation, and cross-account tests added.
- Exact PR #162 merge commit passed all 9/9 post-merge checks: Node.js 18/20/22, PostgreSQL 16 integration, Docker image build, workflow generation, Full Chat browser flow, Fortisni Chromium flow and Admin control flow.
- PR #163 adds editing for bot-specific manual/automatic memory notes with owner/bot isolation. It is under CI validation at this checkpoint.
- No live staging deployment, provider credential test, payment sandbox, or production certification is implied by these code/CI results.

## Verified integration checkpoint — 2026-11-27 (PR #148–#152)

- PR #148 merged as `6c7eb8edce17f75215e33f9561641273ec9e8343`: provider, streaming and vision request timeouts are validated as safe integers in the 1–120,000 ms range before network requests.
- PR #149 merged as `8e97468d777ad07edce3f965da90ef314904cdad`: the mock streaming path applies the same timeout validation before emitting tokens.
- PR #150 merged as `c4a703c2266afe3d44087ed44029cf3683b3c947`: usage-ledger writes reject malformed token counts, including negative, fractional, non-finite, unsafe-integer and string values.
- PR #151 merged as `d7d4cfa604fe210db6904ed27c6abb5946b7d3dc`: reconciled the preceding usage-integrity and knowledge-indexing review evidence.
- PR #152 merged as `cf89330ad1e0dc0c2798e6c216c44846eb113ed3`: admin audit listing filters audit-shaped events and excludes unrelated AI Engineer task-run records without deleting those records.
- Exact current main commit `cf89330ad1e0dc0c2798e6c216c44846eb113ed3` passed all **9/9** post-merge checks: Node.js 18/20/22, PostgreSQL 16 integration, Docker image build, workflow generation, Full Chat browser flow, Fortisni Chromium flow and Admin control flow (run [45961474080](https://github.com/rayyan-anwar/Bot--Maker/actions/runs/45961474080)).
- These changes improve provider timeout validation, usage integrity and audit-list correctness. They do not verify live provider credentials, production billing, staging infrastructure or production readiness.

## Verified integration checkpoint — 2026-11-26 (PR #145 and #146)

- PR #145 merged as documentation reconciliation commit `57b594dc679c7a761d624b9a65cef7add713833e`; its exact head passed Node.js 18/20/22, PostgreSQL 16 and Docker CI.
- PR #146 merged as `573cffdb87afab8071486174c408e79facb2ec8b`. Fortisni vision image uploads now pass through the existing ClamAV scanner before provider handoff. If scanning is required but unavailable, the endpoint rejects the upload with HTTP 503.
- PR #146 exact head `e13520a904f93081a5109c11a1e110de8d1b8ed9` passed Node.js 18/20/22 verification (407 tests per runtime, zero failures), PostgreSQL 16 integration, Docker image build and Full Chat Browser E2E.
- Live ClamAV daemon/signature readiness and real upload verification remain staging tasks. This change does not close issues #2 or #3 and does not certify production readiness.

## Verified integration checkpoint — 2026-11-26 (PR #144)

- PR #144 merged to `main` as commit `3b78386200cdaec6e25a211a8f5ebc7f9c626625`.
- Change: provider response streams are cancelled when stream parsing or downstream token delivery fails; regression coverage asserts cancellation when the consumer throws.
- Exact PR head `a1608da8e4f5fcab50198584272883860096450a` passed BotForge CI: Node.js 18, 20 and 22 verification, PostgreSQL 16 integration, and Docker image build. Full Chat Browser E2E passed on the same head.
- This merge does not close the external release gates. Issues #2 and #3 remain open for real staging infrastructure, secret provisioning, live ClamAV readiness, reverse-proxy verification, backup/restore, operations, load and independent security testing.
- No production deployment or production certification is claimed.

# BotForge Master Completion Tracker

**Repository:** `rayyan-anwar/Bot--Maker`  
**Baseline:** `cf89330ad1e0dc0c2798e6c216c44846eb113ed3`  
**Last reconciled:** 2026-11-27 (after PR #148–#152 and post-merge main CI verification)

## Recent reconciliation checkpoint (2026-11-25)

- PR #138–#141 are merged; PR #141 reconciles PR #140 and post-merge evidence.
- The open-PR queue was checked and is empty at this checkpoint.
- PR #140 production Origin canonicalization and PR #139 cookie/Origin regression checks are automated-tested; actual reverse-proxy behavior still requires staging.
- Release issues #2 and #3 remain open because staging infrastructure, credentials, proxy topology, restore/operations evidence, and independent testing are not available in repository-only work.
- This checkpoint does not claim deployment readiness or percentage completion.

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
| Conversation history and memory | Partial; core controls automated-tested | User-scoped routes, add/edit/delete controls for account-wide memory (PR #162) and bot-specific notes (PR #163 pending), automatic-memory opt-in, and sensitive-candidate filtering are implemented. Pattern filtering is not exhaustive; retention, cross-account isolation and live user testing remain release checks |
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


## Verified checkpoint — 2026-11-25 (canonical production Origin validation)

- PR #140 merged to `main` at commit `d3097e8a21546111e87a0e9d1d84c3c2129cb9bf`.
- Cookie-authenticated mutation requests now reject Origin values that do not exactly match their canonical URL serialization, in addition to the existing same-host and production-HTTPS checks.
- Regression coverage rejects opaque `null`, cross-origin, path-bearing/non-canonical and insecure production Origin values.
- Exact PR head `b1be951304d1bfc0aa9cc2732f7398686690a0ac` passed all six PR checks before merge.
- Post-merge main CI passed all nine checks on merge commit `d3097e8a21546111e87a0e9d1d84c3c2129cb9bf`: Node.js 18/20/22, PostgreSQL 16 integration, Docker image build, Full Chat browser flow, Fortisni Chromium flow, Admin control flow and workflow generation.
- This is application-level Origin validation and automated regression coverage. Actual HTTPS reverse-proxy behavior, trusted forwarded headers and multi-instance rate limits still require staging evidence under open issues #2 and #3.


## Consolidated P0–P2 execution batch — 2026-11-25

This batch is a completion-oriented scope ledger, not a claim that unavailable staging or live services have been exercised.

### P0 acceptance checklist
- [ ] Authentication/session lifecycle: login, expiry, logout, revocation, reset replay, cookie flags, Origin/CSRF and lockout behavior reviewed across all mutating routes.
- [ ] Authorization/tenant isolation: route-by-route owner/admin boundaries; no cross-user access to bots, conversations, memory, files, usage, billing or tool outputs.
- [ ] Edge/proxy: real proxy overwrites forwarded headers; app cannot be reached bypassing proxy; HTTPS redirects/cookies and rate limits verified at edge.
- [ ] Upload safety: content/type/size validation, malware scanning fail-closed, parser timeout/concurrency, isolated execution, storage permissions and deletion lifecycle.
- [ ] Secrets/privacy: secret-manager use, no secrets in logs/PRs, redaction, rotation, memory controls, retention/export/deletion review.
- [ ] Database operations: migrations, rollback, synthetic rehearsal, backups, clean restore, RPO/RTO, multi-instance shared quota/rate limit evidence.
- [ ] CI/release: required checks green on release SHA, dependency/source scan reviewed, browser journeys, rollback and incident runbook.
- [ ] Observability: health/readiness, metrics, alerts and alert delivery tested; operator response and rollback rehearsal.

### P1 acceptance checklist
- [ ] Bot lifecycle: create/configure/version/edit/restore/publish/unpublish/delete and concurrency/malformed input journeys.
- [ ] Chat reliability: provider timeout/retry/cancellation, stream disconnect, error handling, safe output and usage accounting.
- [ ] Provider integrations: real sandbox/credentials for supported providers, model capability/limits, provider outage and cost reconciliation.
- [ ] Memory/history: user inspection/edit/disable/clear, per-bot and account scope, privacy filters, session continuity and deletion.
- [ ] Knowledge retrieval: uploads, scan, parse, chunk, retrieval relevance/citations, injection defense, file removal and reindex boundaries.
- [ ] Admin: privileged controls, auditability, secure recovery, role boundaries and browser E2E.
- [ ] Billing: checkout, webhook signature/idempotency, subscription state, cancellation, refund, entitlement revocation, sandbox reconciliation.
- [ ] UX: responsive desktop/mobile, accessibility/keyboard, empty/loading/error states, settings/themes and safe feedback.

### P2 acceptance checklist
- [ ] AI Engineer: approval gates, worker isolation, filesystem/network/resource limits, task cancellation, retries, failure recovery, secrets/database isolation.
- [ ] Tool calling: allowlist, schema validation, permissions, prompt-injection threat model, human approval for consequential actions and audit log.
- [ ] Model routing: capability-aware routing, fallback, latency/cost controls, provider availability and graceful degradation.
- [ ] Discovery/marketplace: bounded search/pagination, privacy-safe public profile, abuse/reporting/moderation, indexes and load validation.
- [ ] Fortisni: contextual reaction accuracy, negation/ambiguity, reset/session boundaries, voice/image permissions and physical device/browser QA.
- [ ] Analytics: privacy-preserving usage metrics, quota/budget reconciliation, dashboard correctness and alert thresholds.
- [ ] Scale: representative load/soak tests, queue backpressure, worker restart/recovery, database pool limits and capacity plan.
- [ ] Collaboration/SaaS: workspace ownership, roles, invites, tenant isolation, billing boundaries and data export/deletion tests before public registration.

### Batch completion rules
1. Repository code/test/doc tasks can be implemented and submitted as PRs, then merged only after required CI succeeds.
2. Live staging, provider, billing, device, load and independent-review items require real access/evidence; they remain explicitly blocked rather than simulated.
3. Each acceptance item must link to code/test/runbook or dated external evidence. Do not infer completion from a green CI run alone.
4. P0/P1/P2 is considered closed only when the applicable acceptance items are evidenced; the current tracker does not assert full closure.

## Verified integration checkpoint — 2026-11-27 (Ponytail execution)

- PR #150 merged to `main` at commit `c4a703c2266afe3d44087ed44029cf3683b3c947` after all six required checks passed: Docker image build, Node.js 18/20/22 verification, PostgreSQL 16 integration and Full Chat flow.
- Usage-ledger writes now reject negative, fractional, non-finite, unsafe-integer and string token counts before persistence; regression tests cover malformed input and output counts.
- Ponytail review of the next knowledge-indexing candidate found that `server/embeddings.js` already validates vector batch length, indexes, duplicates, finite numeric values and consistent dimensions, including across batches. No duplicate validation layer or new dependency was added to `server/documents.js`.
- Repository simplification remains behavior-preserving and scoped. This checkpoint does not claim broad repository-wide cleanup or production certification.
