# BotForge AI Engineer operations

## Current implementation boundary

The current AI Engineer is an administrator-only, proposal-first integration. It can read recent GitHub Actions metadata, ask one configured AI provider to diagnose that metadata, read one permitted JavaScript/JSON file, and prepare a complete replacement proposal. After a separate explicit administrator confirmation, it can create an isolated branch, commit that one file and open a **draft** pull request.

It does not inspect workflow logs, execute generated code on the application server, merge pull requests, deploy, or autonomously modify production. The GitHub Actions validation workflow checks qualifying pull requests in an isolated GitHub-hosted runner. A successful CI run is evidence for the tested revision, not a security certification.

## Required configuration

Set these values in the hosting provider's server-side environment settings. Never put real credentials in source control, browser JavaScript, issue text or chat.

| Variable | Purpose |
| --- | --- |
| `BOTFORGE_GITHUB_REPO` | Exact `owner/repository` to operate on |
| `BOTFORGE_GITHUB_BRANCH` | Base branch for file reads and draft PRs; defaults to `botforge-production-upgrade` |
| `BOTFORGE_GITHUB_TOKEN` | Fine-grained read token for CI metadata and repository file reads |
| `BOTFORGE_GITHUB_WRITE_TOKEN` | Separate fine-grained write token for isolated branch/commit and draft PR creation |
| `BOTFORGE_ENGINEER_PROVIDER` | One of `openai`, `anthropic` or `gemini` |
| Provider API key | Configure the matching provider key in the server environment |

Grant the read token only access to the selected repository, with **Actions: read**, **Contents: read**, and **Metadata: read**. Grant the separate write token only access to the selected repository, with **Contents: read/write**, **Pull requests: read/write**, and **Metadata: read**. Do not grant administration, workflow modification, secrets, deployment or organization permissions. Confirm the exact permissions supported by the token type in GitHub before use.

The write token is optional. Without it, diagnosis and proposal generation can be enabled while draft PR creation remains unavailable. Rotate either token immediately if exposure is suspected.

## Request limits and patch boundaries

- AI Engineer proposal and draft-PR endpoints share a limit of five requests per minute per client IP.
- Only `.js` and `.json` files under `server/` or `tests/` are accepted.
- Source files and generated replacements are limited to 30 KB.
- Task text is limited to 2,000 characters and summaries to 1,000 characters.
- JSON is parsed and JavaScript is syntax-checked before a proposal is returned or committed.
- The source file SHA is rechecked before branch creation to reject stale proposals.
- Unchanged proposals are rejected.
- A draft PR is created on a generated `botforge-ai-fix/*` branch. The application never merges or deploys it.
- The server revalidates the file path, content size, syntax and explicit `confirm: true` flag. The browser confirmation is not a substitute for server-side authorization.

## Safe operating sequence

1. Configure the selected provider key and read-only GitHub token first.
2. Set the repository and base branch explicitly. Verify the admin identity is correct.
3. Use CI diagnosis for workflow metadata, then inspect the linked run in GitHub directly for full logs.
4. Request a proposal for one small, clearly scoped change.
5. Review the complete diff yourself. Reject changes that weaken authentication, authorization, rate limits, validation, logging or tests.
6. Only for an accepted proposal, enable the separate write token and explicitly confirm draft PR creation.
7. Wait for both BotForge CI and AI Patch Validation to finish. Review the diff and workflow results in GitHub.
8. Keep the PR open until a human maintainer has completed review. Do not merge or deploy solely because CI is green.

## Validation workflow

The AI Patch Validation workflow runs on qualifying pull requests and matching branch pushes. It checks dependencies, runs the production dependency audit, executes the test suite, checks JavaScript syntax, runs the heuristic source scanner, and checks PostgreSQL backup/restore shell syntax. The main CI workflow tests supported Node.js versions.

A green workflow only covers the checks defined in the workflow file. It does not replace review, integration testing with real provider credentials, OAuth provider setup, payment sandbox tests, database restore drills or production monitoring.

## Incident response

- Revoke the affected GitHub token in GitHub immediately.
- Remove the token from the hosting provider's environment settings and rotate any related provider credentials if they may have been exposed.
- Disable AI Engineer access by removing its GitHub environment variables.
- Inspect repository audit events, branches, commits and pull requests for unexpected activity.
- Do not paste secrets into logs or support messages.
