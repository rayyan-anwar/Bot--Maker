# BotForge AI Engineer capability audit

**Audit type:** Repository implementation review  
**Reviewed revision:** `main` at `b3b81c6fe6d5cae545d7ae4db109c561e5592a95`  
**Scope:** AI Engineer routes, admin UI, operating documentation, and GitHub Actions validation workflow  
**Status:** Findings only. This document does not certify security or production readiness.

## Executive summary

BotForge currently contains a useful administrator-only, proposal-first AI Engineer foundation. It can read recent GitHub Actions metadata, request a diagnosis from a configured model provider, read one bounded repository file, validate a complete replacement proposal, and create an isolated branch with a draft pull request after explicit confirmation.

The current implementation is **not yet the fully autonomous maintenance system described in the broader specification**. It does not inspect workflow logs, execute generated patches in a dedicated policy-controlled runner, maintain a durable per-run audit history, or use a GitHub App installation. It must remain an owner-operated proposal tool until those controls are implemented and tested.

## Implemented and evidenced

| Area | Current evidence | Assessment |
| --- | --- | --- |
| Admin access | AI Engineer routes are behind the admin router's authentication and administrator-email check. | Implemented |
| Read-only CI diagnosis | Reads recent Actions runs and job/failed-step metadata. | Implemented; metadata only |
| Source proposal | Reads one `.js` or `.json` file under `server/` or `tests/`; file and task sizes are bounded. | Implemented |
| Prompt boundary | Repository source and task text are explicitly treated as untrusted input in the model instruction. | Implemented; requires adversarial testing |
| Syntax validation | JavaScript is parsed with `vm.Script`; JSON is parsed before proposal acceptance and again before draft creation. | Implemented |
| Stale proposal protection | Re-reads the source file and compares its SHA before creating a branch. | Implemented |
| Human confirmation | Draft-PR endpoint requires server-side `confirm: true`; the UI asks for confirmation. | Implemented |
| Isolated Git branch | Creates a generated `botforge-ai-fix/*` branch and commits one allowed file. | Implemented |
| Draft-only publishing | Opens a draft PR; no merge or deploy operation exists in this route. | Implemented |
| Basic patch limits | Path allowlist, 30 KB content limit, bounded task/summary, and unchanged-content rejection. | Implemented |
| CI checks | GitHub Actions runs tests, syntax checks, heuristic scanning, dependency audit, PostgreSQL integration, and Docker smoke build. | Implemented in workflows |

## Gaps to close before enabling routine autonomous maintenance

### High priority

1. **No durable AI Engineer audit trail.** The specification calls for an activity log containing the request, inspected files, proposed diff, test evidence, provider usage, approval state, and final PR. The current routes return results to the browser but do not persist a dedicated run record. Add append-only records with sensitive values excluded.
2. **No dedicated patch execution sandbox.** The application validates syntax but does not run the generated patch in a separately provisioned, resource-limited, network-restricted runner before publication. Existing repository CI is useful, but the current workflow does not itself establish the complete runner policy described in the specification. Keep draft PRs human-reviewed and do not describe syntax validation as execution testing.
3. **GitHub credentials are fine-grained tokens, not a GitHub App installation.** Separate read and write tokens are a good least-privilege boundary, but the specification's preferred repository-scoped GitHub App lifecycle, installation revocation, and permission checks are not implemented.
4. **No full workflow-log inspection.** CI diagnosis intentionally uses run and job metadata only. Operators must open the GitHub Actions run to inspect logs. Do not describe the AI diagnosis as having read logs or source code.
5. **No end-to-end integration evidence with real credentials.** Without a configured provider key and GitHub tokens, the live diagnosis, source-read, and draft-PR flows cannot be exercised. Unit tests for provider adapters do not prove the live GitHub workflow.

### Medium priority

6. **Engineer-specific write limiting is process-local by default.** The routes use the default in-memory `express-rate-limit` store. This does not establish a shared per-IP limit across multiple application instances. Revisit this before horizontal scaling.
7. **No durable approval or idempotency record for draft creation.** The UI disables the button while a request is in flight, but the server does not persist an approval record or an idempotency key. Repeated confirmed requests can create multiple draft branches/PRs.
8. **No explicit global AI Engineer kill switch or per-project pause state.** Removing environment variables disables integrations, but there is no first-class admin control with a visible status and durable state.
9. **No per-run cost, token, time, or changed-file budget record.** Individual provider calls have time/token bounds and one-file/30 KB limits, but aggregate budgets and reporting are not implemented.
10. **Security scanner results are heuristic.** The admin UI correctly labels the scan as incomplete. Findings require manual review and should not be presented as a penetration test.

## Required next sequence

1. Preserve proposal-only and draft-PR-only behavior. Do not add merge or deployment permissions.
2. Add a durable, redacted AI Engineer run/audit record and tests for retention and access control.
3. Add a server-side kill switch and per-project pause control before scheduled or repeated operation.
4. Add server-side idempotency and a durable human approval record for draft-PR creation.
5. Decide whether to adopt a GitHub App; if so, implement repository-scoped installation and revocation with least privilege.
6. Design and test a dedicated ephemeral patch-validation runner with explicit command allowlists, resource/time limits, no secrets, and restricted network access.
7. Add adversarial tests for prompt injection in source files, path traversal, stale proposals, duplicate submissions, oversized output, and failed GitHub API operations.
8. Only after the above, consider read-only scheduled monitoring. Keep live provider/GitHub credential testing and external review as separate release gates.

## Operational constraints

- No provider API key, GitHub token, hosting service, or paid resource is required to keep working on repository-only UI, documentation, and offline tests.
- Do not add real credentials to repository files, browser code, issues, or chat.
- Do not merge AI-generated PRs or deploy automatically.
- This audit is a source review, not a live penetration test, production certification, or proof that every path is defect-free.
