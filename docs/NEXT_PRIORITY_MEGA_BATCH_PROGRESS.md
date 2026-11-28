# BotForge next-priority mega-batch progress

Updated: 2026-11-28

Percentages below are engineering estimates, not test coverage or a claim of production readiness.

| Priority | Estimated completion | Evidence in repository | Remaining gate |
|---|---:|---|---|
| Social Intelligence OAuth foundation | 65% | Provider-specific authorization URLs and callbacks for Instagram Business Login, YouTube and LinkedIn; one-time owner/platform-bound state; YouTube S256 PKCE; code exchange, profile lookup, encrypted token storage, refresh endpoints and mocked callback tests | Real provider app credentials/approval, live consent and API smoke tests, approved analytics/publishing scopes, remote revocation, KMS-backed key rotation |
| AI Engineer approval-to-draft-PR | 75% | Admin-only control, kill switch, audit, allowlisted paths, isolated Docker syntax validation, one-time approval and draft PR flow tests | Real least-privilege GitHub app/token, real Docker staging, failure/replay drills |
| Knowledge Base and ingestion | 80% | Unicode chunking, BM25/hybrid retrieval, stable document/chunk IDs, citation source deduplication, exact-content duplicate prevention, atomic per-bot document and text-capacity limits, PostgreSQL concurrency tests, PDF worker isolation and upload safety tests | Golden dataset evaluation, grounded-answer scoring, malware scanner staging and deletion tests |
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

- Upload capacity and duplicate checks now run under a per-bot PostgreSQL advisory transaction lock, preventing concurrent requests from exceeding configured limits or inserting the same extracted content more than once. JSON development storage performs the same checks in one synchronous critical section.
- Added PostgreSQL integration coverage for concurrent capacity and duplicate-upload races. CI for this latest integration-test commit is pending.


## AI budget operations follow-up

- Added bounded admin-only AI budget summary, reservation inspection and ledger inspection endpoints.
- Added manual settlement for a reservation using a verified provider request ID and exact decimal actual-cost input. The database settlement function remains authoritative and refuses settlement above the reserved ceiling.
- Added a partial PostgreSQL expiry index for open reservations. No automatic release job is enabled because an expired reservation may still represent a billable provider call after an application crash.
- Added rate limiting for admin AI budget mutations and integration coverage for over-reservation attempts retaining the original hold.
- Added CI coverage that verifies admin budget routes fail closed when PostgreSQL is unavailable. Latest CI for the final rate-limit commit is pending.


## Verified checkpoint — 2026-11-21

- Main branch snapshot checked at `16e08ee94b0e8becc5e3abef36c2db93adf95c60`.
- Latest BotForge CI run (#1096) for that commit completed successfully. This confirms the repository CI result only; it is not a substitute for staging or real-device verification.
- Open PR queue checked: PR #40 is the only open PR and remains a draft, so it is not eligible for merge.
- The previously pending follow-up work is present on main at this checkpoint. No open, non-draft PR was available to merge.

## Next implementation batch — order of execution

1. **Budget enforcement reliability:** complete the multi-scope reservation contract (global + user + model/tenant), atomic all-or-nothing reservation/settlement, and concurrency/idempotency tests before enabling real spend enforcement.
2. **Social Intelligence live-provider groundwork:** add provider adapter contracts and safe callback/token lifecycle tests; keep live credentials, platform approval, and real account connections out of CI.
3. **Knowledge Base quality gate:** add a repeatable golden evaluation dataset for retrieval recall, citation integrity, and grounded-answer behavior; publish thresholds and test results.
4. **Release operations:** add alert rules and runbook validation; staging remains blocked until a real host, managed database, secrets, HTTPS, malware scanner and smoke test are available.
5. **Cross-platform QA:** complete responsive/accessibility/browser test matrix first; native Capacitor/Tauri packaging remains a separate milestone and must not be represented as completed.

These are sequencing decisions, not claims that the listed work is already implemented.


## Verified checkpoint — 2026-11-24

The following changes have been merged to `main` and verified through their recorded CI checks:

- PR #92: bounded HTTP server shutdown and lingering-socket cleanup; BotForge CI and Full Chat Browser E2E passed.
- PR #93: strict plain-JSON Agent Lab tool argument validation; BotForge CI and Full Chat Browser E2E passed.
- PR #94: bounded automation completion payloads with durable checkpoints, workflow revision pinning, and authenticated-owner-scoped knowledge search; Node.js 18/20/22 verification, PostgreSQL 16 integration, Docker image build, and Full Chat Browser E2E passed.
- PR #95: strict single-hop trusted proxy configuration and forwarding-header spoofing tests; BotForge CI and Full Chat Browser E2E passed.
- PR #96: deterministic English/Hindi retrieval golden dataset and recall@k / mean reciprocal rank quality gate; BotForge CI passed.
- PR #97: Prometheus starter alert rules for server error rate, average request duration and resident memory; BotForge CI passed.

The earlier PRs #85, #86, #88, #89 and #90 were closed as superseded by the consolidated merged implementations above.

These checks validate repository code and CI only. Live provider credentials, actual Prometheus/Alertmanager deployment, managed staging, production backup/restore, independent security testing and physical device validation remain separate release gates.


- PR #98: Fortisni smartwatch and paired-phone visual-intelligence product/technical specification moved onto current mainline; BotForge CI passed. This is a specification only, not a native watch app or working camera pipeline.
- Legacy PRs #72–#82 and #84 were closed after confirming their relevant hardening was already present on main or superseded by the current smartwatch specification. Draft PR #40 was closed because the PostgreSQL budget ledger and maintained budget design are already in the repository.
- Open PR queue was checked after reconciliation and is empty. This is queue cleanup, not a claim that all product roadmap work is complete.


## Verified checkpoint — 2026-11-24 (Fortisni phone vision continuity)

- PR #101 merged to `main` at merge commit `2cf10229d1cc9af2bbc5614486cc164cfce6dc02`.
- A successful, explicitly user-initiated phone image analysis stores only a bounded text summary (maximum 3,000 characters) for 10 minutes; image bytes are not persisted.
- The next authenticated chat request for the same account atomically consumes the newest eligible summary once. The prompt explicitly treats it as untrusted descriptive context, not instructions.
- JSON-store tests cover one-time consumption, expiry and cross-account isolation.
- PostgreSQL 16 integration test exercises 12 concurrent consumers and confirms only one can claim the context.
- Latest verified CI: Node.js 18/20/22, PostgreSQL 16 integration, Docker build/readiness smoke test, and Full Chat Browser E2E all passed. The Node 18 job was rerun after an infrastructure cancellation and passed.
- External OpenAI credentials, physical camera behavior, and real-device UX remain outside CI verification.



## Verified checkpoint — 2026-11-24 (Fortisni browser voice)

- PR #102 merged to `main` at merge commit `369e9a97a1ccf7b4eb81d108a15ce30e6e68cd42`.
- Chat now offers optional browser speech recognition. Recognized final text is inserted into the composer and is never auto-submitted.
- Spoken assistant replies are opt-in and disabled by default. Speech output is controlled by the browser speech synthesis API.
- Added permission/error/unsupported-browser feedback, accessible live status, and responsive controls.
- Added unit tests for unsupported APIs, transcript insertion, permission failures, opt-in speech output and cleanup.
- Latest BotForge CI passed on Node.js 18/20/22, PostgreSQL 16 integration and Docker build/readiness; Full Chat Browser E2E passed.
- Browser/OS locale support and physical microphone/speaker behavior still require real-device QA. Browser speech recognition may use the browser vendor's speech service; no audio is sent to the BotForge API.



## Verified checkpoint — 2026-11-24 (Fortisni affection reaction consistency)

- PR #103 merged to `main` at `dcdf763ba423c6a781ffeb923e5e9141a57a0b7f`; BotForge CI and Full Chat Browser E2E both completed successfully.
- Follow-up batch created on `feat/fortisni-affection-reaction-consistency`: align browser and server reactions for affectionate English/Hindi/Hinglish messages and prevent `miss you` from being classified as sadness before the affection rule can run.
- This follow-up is not yet merged or verified; its PR checks must pass before integration.


## Verified implementation batch — 2026-11-28 (Social Intelligence OAuth)

- Added provider-specific authorization URL generation and callback handling for Instagram Business Login, YouTube OAuth and LinkedIn OpenID Connect.
- OAuth state remains random, one-time, ten-minute, and bound to the authenticated account and platform. The callback requires the same authenticated account; state is consumed before code exchange.
- YouTube authorization uses S256 PKCE and offline access; Instagram exchanges its short-lived token for a long-lived token and supports token refresh; YouTube and LinkedIn use refresh tokens when issued by the provider.
- Provider tokens are stored only as AES-256-GCM encrypted envelopes. API responses expose connection metadata, never access or refresh tokens.
- Added an owner-scoped token refresh endpoint, environment configuration examples and mocked integration coverage for all three provider callbacks, YouTube PKCE and token refresh.
- Tests mock external provider responses. They do not prove live provider app approval, consent, real API permissions, analytics, publishing or revocation.
- Disconnect removes the locally stored credentials. Remote provider grant revocation and managed KMS key rotation remain unimplemented; users must revoke grants through provider account settings until provider-specific revocation is added.
- The 65% figure is an engineering estimate for the Social Intelligence workstream, not live integration certification.
