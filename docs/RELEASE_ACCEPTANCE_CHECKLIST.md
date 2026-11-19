# BotForge release acceptance checklist

This checklist separates automated repository checks from evidence that must be collected in a real staging environment. A green CI run is necessary, but it is not production certification.

## 1. Build and automated checks
- [ ] All required GitHub Actions checks pass on the exact release commit.
- [ ] Node.js 18, 20, and 22 test jobs pass.
- [ ] Production dependency audit has no unreviewed high/critical findings.
- [ ] Syntax and repository security scans pass; review findings rather than treating a clean pattern scan as a penetration test.
- [ ] PostgreSQL 16 migrations, concurrency tests, and backup/restore rehearsal pass.
- [ ] Docker image builds and the /readyz endpoint responds successfully.
- [ ] Browser tests pass for signup-to-chat, Fortisni reactions, and administrator controls.
- [ ] Store workflow run URLs and the tested commit SHA in the release record.

## 2. Staging environment prerequisites
- [ ] Deploy an isolated staging environment using the intended production topology.
- [ ] Use managed PostgreSQL with TLS, least-privilege credentials, and automated backups.
- [ ] Configure a unique strong JWT secret and admin identity; never reuse CI or development credentials.
- [ ] Configure HTTPS, trusted proxy settings, secure cookies, host/origin validation, and restrictive security headers.
- [ ] Confirm secrets are injected through the hosting secret manager and are absent from logs, images, browser bundles, and diagnostic responses.
- [ ] Keep AI Engineer paused until its complete staging workflow has been tested.
- [ ] Do not mount a production Docker socket into the web application. Any patch validator must run on a dedicated disposable worker with no production secrets or database access.

## 3. Authentication and tenant isolation
- [ ] Verify signup, login, logout, password reset, session revocation, and account lockout over HTTPS.
- [ ] Verify administrator access is limited to the configured administrator identity.
- [ ] Verify one tenant cannot read, update, delete, or infer another tenant's bots, chats, documents, memory, or usage.
- [ ] Verify public bot views never expose private instructions, secrets, or private knowledge.
- [ ] Verify cookie-authenticated mutations reject missing, foreign-host, and malformed Origin headers.
- [ ] Verify rate limits are shared across at least two application instances when PostgreSQL is configured.

## 4. AI Engineer safety validation
- [ ] Verify pause/resume state persists across application restarts and database reconnects.
- [ ] Verify provider and GitHub credentials have minimum required scopes and are kept separate for read and write operations.
- [ ] Verify CI diagnosis uses only approved metadata and clearly reports unavailable or incomplete evidence.
- [ ] Verify prompt-injection attempts in repository metadata and source content cannot override fixed policy or expand file access.
- [ ] Verify path traversal, encoded paths, unsupported extensions, oversized patches, stale base SHAs, expired approvals, approval replay, and concurrent approval claims are rejected or safely recovered.
- [ ] Verify generated code is never executed by the web application or syntax validator.
- [ ] Verify draft PR creation is the maximum automated write action; no autonomous merge, release, or deployment is enabled.
- [ ] Verify the dedicated sandbox worker has network and resource restrictions using real runtime tests, not mocked command assertions.
- [ ] Verify failure recovery for GitHub API timeouts, rate limits, permission errors, duplicate requests, and worker termination.
- [ ] Set and enforce per-user, per-task, and global token/cost/time budgets before enabling provider-backed workflows.

## 5. Files, billing, and operational controls
- [ ] Verify upload size/type limits, malware scanning, archive/decompression limits, and storage isolation.
- [ ] Verify billing provider sandbox checkout, webhook signatures, idempotency, cancellation, refunds, and entitlement revocation.
- [ ] Verify usage limits and counters remain correct across restarts and multiple instances.
- [ ] Verify backup restore into a clean staging database and document recovery time and recovery point.
- [ ] Verify logs and audit events redact prompts, uploaded content, credentials, provider responses, and personal data.
- [ ] Verify account export, deletion, retention, and privacy disclosures against implemented behavior.
- [ ] Verify monitoring, alerting, health/readiness probes, and an operator rollback procedure.

## 6. Release decision
A release may be considered for a limited production pilot only after the above checks have named owners, dated evidence, and explicit risk acceptance for remaining gaps. An independent security review and load test should precede broad public launch.

Record for each release:
- Release commit SHA:
- Staging URL/environment:
- Test date and operator:
- CI run URL:
- Browser E2E run URL:
- PostgreSQL backup/restore evidence:
- Sandbox worker validation evidence:
- Payment sandbox evidence:
- Open security findings and accepted risks:
- Rollback procedure and decision owner:

**Status rule:** Mark an item complete only when evidence exists for the target deployment. Source-code tests and mocked CI checks do not prove live infrastructure behavior.