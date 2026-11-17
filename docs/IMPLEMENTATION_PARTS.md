# BotForge Implementation Parts

This document tracks assistant-side implementation and verification. A part is complete only when its code/documentation changes are committed and the relevant automated checks have completed successfully. Queued, cancelled, or unexecuted checks are not passes.

## Part 1: CI and regression baseline
- [x] Correct production admin email validation syntax and expression.
- [x] Add regression coverage for invalid and valid owner email formats.
- [ ] Obtain a completed CI run for the current branch head (Node 18/20/22, PostgreSQL 16, Docker).
- [x] Remove duplicate branch-push and pull-request CI triggers; add concurrency cancellation for superseded CI runs.
- [x] Keep isolated AI patch validation as a manual workflow; standard pull-request verification remains in BotForge CI.
- [ ] Resolve any failures and rerun affected checks.
- Status: In progress. CI trigger cleanup is committed; the latest run must still complete successfully before this part can be closed.


- CI runner retry note: latest head `d6c6c76` has five jobs created but still queued with no assigned runner; this is infrastructure scheduling, not a test failure. Do not mark Part 1 verified until a fresh run completes.

## Part 2: Deterministic dependencies and container build
- [ ] Generate and commit package-lock.json.
- [ ] Switch CI and Docker production install to npm ci where appropriate.
- [ ] Verify clean install and Docker build on the lockfile.
- [ ] Review dependency audit findings and pin compatible Node engine behavior.
- Status: Not started.

## Part 3: Authentication, authorization, and API security
- [ ] Review CSRF/Origin behavior, proxy trust, cookies, CORS and rate limits.
- [ ] Audit authorization and ownership checks across all routes.
- [ ] Review validation, SSRF boundaries, secret exposure and log redaction.
- [ ] Add targeted negative and tenant-isolation regression tests.
- Status: Not started.

## Part 4: AI, documents, uploads, and memory
- [ ] Add mocked provider adapter tests for success, provider errors, timeouts and malformed responses.
- [ ] Test upload validation, ClamAV fail-closed behavior, PDF limits and cleanup.
- [ ] Test RAG untrusted-context handling, citations and memory controls.
- [ ] Verify quota reservation/release behavior on provider failures.
- Status: Not started.

## Part 5: PostgreSQL, billing, backup, and recovery
- [ ] Review migrations, transactions, indexes and multi-instance behavior.
- [ ] Expand PostgreSQL integration coverage for concurrency and failure cases.
- [ ] Add Stripe/Razorpay webhook signature and idempotency tests with fixtures.
- [ ] Review backup/restore safety and document a rehearsal checklist.
- Status: Not started. Live managed-service rehearsals require operator credentials and infrastructure.

## Part 6: Browser E2E and release readiness
- [ ] Add browser-level smoke coverage for admin login, bot CRUD, chat, memory and uploads.
- [ ] Verify admin-only production UI and non-production customer flows.
- [ ] Review monitoring, rollback, retention/deletion, privacy and terms requirements.
- [ ] Complete final release checklist and update the pull request.
- Status: Not started. Staging deployment and production release remain operator-approved actions.

## Progress rules
- Report overall progress as a clearly labelled estimate, not a test result.
- Mark individual checks complete only with repository evidence.
- Do not merge the pull request or deploy without explicit owner approval.
