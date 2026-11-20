# BotForge AI Engineer and Fortisni implementation audit

**Audit type:** Repository source and CI review  
**Reviewed revision:** `16634352d33b9a35ac341d79df9bb889b6ab2f7f`  
**Status:** Updated implementation inventory and remaining validation gaps. This is not a security certification or production-readiness approval.

## Executive summary

BotForge has an administrator-only, proposal-first AI Engineer foundation. It reads recent GitHub Actions run/job metadata, can request a provider diagnosis when configured, reads one permitted repository file, creates a syntax-checked replacement proposal, and can publish one approved file change to an isolated branch as a draft pull request after explicit administrator confirmation.

Security regression coverage now includes adversarial path and prompt-boundary cases, stale and duplicate approval handling, provider-output size and malformed-JSON rejection, and GitHub source/branch failure handling. Rejected or failed operations are tested not to create unintended approval records or draft pull requests. The oversized-output hardening change is merged in PR #33.

Fortisni is integrated into the chat experience and has browser coverage for the signup-to-chat flow. Dedicated admin-control browser coverage also exists. These automated tests improve confidence but do not establish production safety.

## Current implementation evidence

| Area | Current evidence | Assessment |
| --- | --- | --- |
| Admin access and kill switch | Admin-only routes; persistent pause/resume state; guarded operations fail closed if control state cannot be read. | Implemented; live staging identity/configuration check remains |
| CI diagnosis | Reads bounded Actions run/job metadata; does not fetch full workflow logs. | Implemented with documented limitation |
| Source proposal | Reads one permitted JavaScript/JSON file under `server/` or `tests/`; task, file and output sizes are bounded. | Implemented |
| Prompt and path boundaries | Adversarial tests cover untrusted task/source content and path traversal/lookalike cases. | Regression coverage implemented |
| Provider output handling | Malformed JSON and oversized generated replacement content are rejected. | Regression coverage implemented in PR #33 |
| Approval and replay protection | Server-issued, expiring approval binds actor, repository, branch, path, base SHA, content hash and task hash; atomic claim and replay recovery prevent duplicate PR creation. | Implemented; live GitHub failure/recovery rehearsal remains |
| Publishing boundary | One permitted file on an isolated branch; explicit server-side confirmation; draft PR only. | Implemented; no merge/deploy path |
| Syntax validation and runner contract | JavaScript syntax and JSON parsing; Docker adapter uses no network, read-only source mount and bounded resources. Runner envelopes bind repository, allowed path, base revision, patch digest, profile/policy versions, bounded output and short expiry; results are checked for job binding, terminal state, timestamp, immutable worker-image digest and exit-code consistency. | Contract validation only; cryptographic signature verification and a dedicated production sandbox remain external/unimplemented |
| Rate limiting | AI Engineer write endpoints use a five-per-minute default and PostgreSQL-backed shared store when PostgreSQL is configured. | Implemented; deployment-level multi-instance/failover test remains |
| Audit history | Redacted operational events, latest 100 shown, maximum 1,000 retained. | Implemented; not immutable or compliance-grade |
| Fortisni | Chat reactions and visual states; browser signup-to-chat flow and admin-control-flow browser workflows. | Automated browser coverage exists; broader accessibility/language testing remains |
| CI and release controls | Main CI, browser E2E workflows and release acceptance checklist. | Automated checks are evidence for tested revisions, not certification |

## Remaining gaps before production operation

### High priority

1. **Dedicated ephemeral patch runner:** the current Docker adapter performs syntax checking only. It does not run an approved test suite against the generated patch in a separately provisioned, disposable worker. A production runner needs fixed command allowlists, strict resource/time limits, no application secrets, restricted network access and isolation from the production database and Docker control plane. The runner contract validator is now stricter, but does not launch a worker or verify result signatures.
2. **GitHub App lifecycle:** current integration uses separate fine-grained read and write tokens. A repository-scoped GitHub App, installation/revocation lifecycle and permission verification remain unimplemented.
3. **Live credential integration:** provider calls, GitHub source reads and draft-PR publishing still require a controlled staging test with real credentials.
4. **Independent security review:** repository tests and heuristic scanning are not a penetration test.
5. **Operational rehearsal:** PostgreSQL shared rate limiting, approval recovery, backup/restore and failure behavior need staging validation under realistic multi-instance conditions.

### Medium priority

6. **Aggregate budgets:** per-request limits exist, but there is no cumulative per-run or global token, cost and wall-clock budget ledger.
7. **Tamper-evident audit:** current audit records are redacted and bounded but can be changed by an application/database administrator and are not externally retained.
8. **Fortisni quality:** text reactions are heuristic, with limited language and context coverage. They must not be represented as reliable emotion detection or used for high-stakes inference.
9. **Broader browser and accessibility coverage:** continue testing error paths, keyboard navigation, reduced motion, mobile layouts and admin confirmation behavior.

## Required operating constraints

- Keep AI Engineer proposal-only and draft-PR-only. Do not add autonomous merge or deployment.
- Do not enable scheduled or paid provider usage until explicit owner opt-in and budget controls are in place.
- Never commit real credentials or pass secrets to the coding model or patch runner.
- Review every generated diff manually, especially authentication, authorization, security, billing, migrations and data deletion changes.
- A green CI run is evidence for the tested revision only. It is not production certification, a penetration test or proof that every code path is defect-free.


## Runner contract hardening follow-up

The runner contract validator now accepts Git SHA-1 or SHA-256 base revisions, requires allowlisted repository paths, limits job validity to 15 minutes, binds completion timestamps to the job window, requires immutable SHA-256 worker image digests, measures diagnostics in UTF-8 bytes, and enforces terminal-state/exit-code consistency. The result remains explicitly untrusted until a separate service verifies its cryptographic signature.
