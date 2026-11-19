# Part 2: Security and Reliability

## Scope

This part hardens the existing BotForge implementation without changing the product direction or deploying infrastructure.

## Changes in this branch

- Added an account-scoped chat burst limit. PostgreSQL deployments use the shared rate-limit table; local JSON development uses the existing in-memory adapter.
- Added a regression test proving the configured per-account chat limit returns HTTP 429 after the allowed request.
- Production cookie-authenticated mutations now require a same-host HTTPS Origin. Development and test environments continue to allow same-host HTTP for local use.
- Added regression coverage for rejecting missing and HTTP origins in production while accepting a same-host HTTPS Origin.
- Added cross-account regression coverage for private bot reads, edits, version history and rollback, documents, chat, bot memory, personal memory, usage summaries, billing-customer visibility and deletion.
- Verified public bot serialization excludes private instructions when a non-owner reads a public bot.

## Existing controls reviewed

The Part 1 base already includes authentication throttling, account lockout, session-version revocation, same-host Origin checks, JSON body limits, security headers, bot ownership checks, usage reservations, upload throttling, ClamAV fail-closed behavior in production, bounded PDF parsing, PostgreSQL-backed rate-limit storage, and webhook event deduplication.

These code-path reviews are not a substitute for external operational verification. New regression tests and current-head CI must pass.

## Additional audit fixes

- Razorpay paid entitlements now require an explicitly active subscription. Unknown, pending, paused, halted, cancelled and completed states resolve to the free plan; regression tests cover these states.
- Stripe and Razorpay webhook claims now use a five-minute processing lease. Completed events remain deduplicated, in-flight duplicates receive a retryable conflict, failed processing releases the claim, and abandoned claims can be reclaimed after expiry.
- Added local-store regression tests for webhook completion, duplicate delivery, concurrent processing, explicit release and expired-lease recovery.
- Confirmed document uploads are owner-only, size-limited, ClamAV fail-closed in production, PDF-parsed in a resource-limited worker with an eight-second timeout, and temporary files are removed in a finally block.
- Confirmed provider requests have bounded abort timeouts, public errors do not expose provider response bodies, usage reservations are released after failed chat generation, and chat-turn records plus quota consumption commit transactionally.
- Confirmed backup/restore scripts use restrictive file permissions and require an explicit destructive-restore confirmation.

## Remaining external verification

- Run current-head CI after the latest webhook lease and entitlement changes.
- Perform a real staging backup and restore rehearsal against a disposable PostgreSQL instance.
- Exercise live Stripe/Razorpay sandbox events and real provider timeout behavior with test credentials.
- Run browser E2E, load testing and an independent penetration/security review before production deployment.

## Verification boundaries

A passing CI run verifies only the automated checks defined in the workflow. It does not replace browser E2E, live provider and payment sandbox tests, a managed PostgreSQL rehearsal, load testing, penetration testing or a professional security review.

No hosting, paid service, API credential or production deployment is being provisioned as part of this work.
