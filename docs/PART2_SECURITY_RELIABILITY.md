# Part 2: Security and Reliability

## Scope

This part hardens the existing BotForge implementation without changing the product direction or deploying infrastructure.

## Changes in this branch

- Added an account-scoped chat burst limit. PostgreSQL deployments use the shared rate-limit table; local JSON development uses the existing in-memory adapter.
- Added a regression test proving the configured per-account chat limit returns HTTP 429 after the allowed request.
- Production cookie-authenticated mutations now require a same-host HTTPS Origin. Development and test environments continue to allow same-host HTTP for local use.
- Added regression coverage for rejecting missing and HTTP origins in production while accepting a same-host HTTPS Origin.

## Existing controls reviewed

The Part 1 base already includes authentication throttling, account lockout, session-version revocation, same-host Origin checks, JSON body limits, security headers, bot ownership checks, usage reservations, upload throttling, ClamAV fail-closed behavior in production, bounded PDF parsing, PostgreSQL-backed rate-limit storage, and webhook event deduplication.

These existing controls are not automatically re-certified by this part. New tests and current-head CI must pass.

## Remaining Part 2 work

- Route-by-route authorization and tenant-isolation regression coverage, including bot, document, chat, memory, usage and billing resources.
- Review request validation and public/private data serialization.
- Review provider timeout/error handling, quota reservation/release and spend controls.
- Review upload cleanup, malware-scanner failure modes and document deletion behavior.
- Review PostgreSQL transaction boundaries, webhook idempotency and backup/restore procedures.
- Add or improve targeted regression tests for any defects found.

## Verification boundaries

A passing CI run verifies only the automated checks defined in the workflow. It does not replace browser E2E, live provider and payment sandbox tests, a managed PostgreSQL rehearsal, load testing, penetration testing or a professional security review.

No hosting, paid service, API credential or production deployment is being provisioned as part of this work.
