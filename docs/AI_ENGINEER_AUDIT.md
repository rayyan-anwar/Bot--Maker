# BotForge AI Engineer and Fortisni implementation audit

**Audit type:** Repository source review  
**Reviewed revision:** `main` at `0161215d78d597b4aac68c6bd6aa31f40bf62ecc`  
**Scope:** AI Engineer routes, persistent controls and approvals, admin UI, Fortisni chat integration, tests and operating documentation  
**Status:** Implementation inventory and remaining validation gaps. This is not a security certification or production-readiness approval.

## Executive summary

BotForge now has an administrator-only, proposal-first AI Engineer foundation. It can read recent GitHub Actions run/job metadata, request an AI diagnosis when a provider is configured, read one permitted repository file, generate and syntax-check a complete replacement proposal, and create an isolated branch with a draft pull request after explicit administrator confirmation.

The previously documented gaps for a persistent global pause control, bounded operational audit history, and one-time approval/idempotency have been implemented and merged. They must no longer be tracked as missing features.

Fortisni is mounted in the bot chat page, classifies common English and Hindi text, reacts to user and assistant messages, exposes expressive visual states, and respects reduced-motion preferences in CSS.

Neither feature set is production-certified. The repository CI suite does not replace browser E2E, live credential integration, an isolated AI patch runner, or independent security review.

## Current implementation evidence

| Area | Current evidence | Assessment |
| --- | --- | --- |
| Admin access | Admin router requires authentication and checks the configured administrator email. | Implemented; live identity/configuration still needs staging verification |
| CI diagnosis | Reads recent GitHub Actions run and job/failed-step metadata; provider receives only the bounded metadata object. | Implemented; does not inspect workflow logs or source |
| Source proposal | Reads one permitted JavaScript/JSON file under `server/` or `tests/`; task, file and output sizes are bounded. | Implemented |
| Prompt boundary | Source and task are explicitly treated as untrusted input in the model instruction. | Implemented; adversarial tests still required |
| Syntax validation | JavaScript is parsed with `vm.Script`; JSON is parsed before proposal acceptance and draft creation. | Implemented; syntax validation is not execution testing |
| Stale proposal protection | Re-reads the source file and compares its blob SHA before writing. | Implemented |
| Persistent global pause | Admin can pause/resume AI Engineer; saved database state takes precedence; missing state defaults to paused unless explicitly bootstrapped; guarded operations fail closed on control read failure. | Implemented |
| Operational audit history | Admin dashboard displays bounded events; event fields exclude prompts, source, generated code, provider output and credentials; retention is capped at 1,000. | Implemented; not immutable or a compliance ledger |
| One-time approval | Server-issued 30-minute approval binds administrator, repository, base branch, path, base SHA, exact content hash and task hash. | Implemented |
| Duplicate prevention | Approval claim is atomic in JSON/PostgreSQL storage; deterministic branch and replay recovery return the recorded draft PR. | Implemented; GitHub API failure/recovery still needs live integration testing |
| Human confirmation | Draft endpoint requires the approval ID and server-side `confirm: true`. | Implemented |
| Isolated publishing | Writes one allowed file to a generated branch and opens a draft PR only. | Implemented; no merge or deployment path |
| Fortisni chat integration | Bot chat page calls Fortisni for user text, assistant response, thinking and error states. | Implemented |
| Fortisni language coverage | Unit tests cover common English and Hindi phrases, neutral/empty text and fixed visual states. | Implemented; language and false-positive coverage is limited |
| Motion accessibility | Fortisni styles include a `prefers-reduced-motion` rule. | Implemented |
| Automated validation | CI covers supported Node versions, PostgreSQL integration and Docker build; AI patch validation has its own workflow. | Implemented for configured checks; not browser E2E |

## Remaining gaps before routine or autonomous maintenance

### High priority

1. **No dedicated patch execution sandbox.** Generated code is syntax-checked but is not executed in a separately provisioned, resource-limited, network-restricted runner before a draft PR is created. Repository CI runs after publication and is not a substitute for pre-publication sandbox validation.
2. **No GitHub App installation lifecycle.** The current integration uses separate fine-grained read and write tokens. Repository-scoped GitHub App installation, revocation handling and permission verification remain unimplemented.
3. **No full workflow-log inspection.** CI diagnosis uses run and job metadata only. Operators must open the GitHub Actions run directly to inspect full logs.
4. **No live end-to-end credential evidence.** Provider calls, GitHub source reads and draft-PR publishing have not been verified with real configured credentials in a staging environment.
5. **No browser E2E for Fortisni or the full AI Engineer flow.** Current tests are Node unit/integration tests. They do not prove visual rendering, accessibility behavior, browser timer interactions, admin confirmation flow or full chat streaming in a real browser.
6. **No independent penetration test.** The repository heuristic scanner is pattern-based and cannot establish the absence of vulnerabilities.

### Medium priority

7. **Engineer write rate limiting is process-local.** The route limiter uses the default in-memory `express-rate-limit` store. It is not a shared cross-instance quota.
8. **No aggregate cost/token/time budget ledger.** Individual provider calls and patch sizes have limits, but cumulative usage and per-run cost reporting are not implemented.
9. **Audit history is operational, not immutable.** It is bounded and redacted, but does not provide tamper-evident or externally retained compliance records.
10. **Fortisni text classification is heuristic.** Phrase matching can miss context, sarcasm, negation and languages beyond the covered English/Hindi phrases. It should not be represented as reliable emotion detection or used for high-stakes inference.
11. **No live multi-instance/failover rehearsal.** PostgreSQL concurrency tests exist, but deployment-level behavior under multiple application instances and failover still requires staging validation.

## Required next sequence

1. Keep AI Engineer proposal-only and draft-PR-only. Do not add autonomous merge or deployment.
2. Add adversarial regression tests for prompt injection in source files, path traversal, stale approvals, duplicate submissions, oversized output and GitHub API failure recovery.
3. Add browser E2E for admin login, pause/resume, audit visibility, proposal review, explicit draft-PR confirmation, Fortisni chat reactions, streaming completion and error states.
4. Design a dedicated ephemeral patch-validation runner with fixed command allowlists, resource/time limits, no secrets and restricted network access.
5. Decide whether to replace fine-grained tokens with a repository-scoped GitHub App.
6. Add shared rate limiting and aggregate usage/cost budgets before horizontal scaling or scheduled operation.
7. Verify live provider/GitHub integrations in staging, then complete independent security review and release gates.

## Operational constraints

- No provider API key, GitHub token, hosting service or paid resource is required for repository-only tests and documentation work.
- Do not add real credentials to source control, browser code, issues or chat.
- AI-generated changes remain draft PRs requiring human review.
- A green CI run is evidence for the tested revision only. It is not production certification, a penetration test, or proof that every code path is defect-free.
