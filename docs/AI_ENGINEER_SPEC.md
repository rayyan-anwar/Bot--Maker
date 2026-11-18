# BotForge AI Engineer

## Purpose

BotForge AI Engineer is an optional, owner-controlled software maintenance agent. It helps maintain the BotForge application itself; it is separate from customer-facing bots created by BotForge users.

## Core capabilities

1. Inspect application health, structured error reports, failed CI runs and dependency/security alerts.
2. Triage issues, identify likely root causes and rank them by severity and confidence.
3. Read the repository through a narrowly scoped GitHub App installation.
4. Prepare code changes on an isolated branch and open a Pull Request with a summary, risk assessment and test evidence.
5. Add or update regression tests for bug fixes where practical.
6. Run approved test, lint, syntax and build commands in an isolated runner.
7. Draft feature implementations from an explicit owner request and submit them as Pull Requests.
8. Produce an activity log showing detected issue, files inspected, proposed diff, test results, model/provider usage and approval state.

## Safety model (mandatory)

- Never write directly to the default branch.
- Never merge or deploy its own changes. A human owner must review and approve each Pull Request.
- Never run arbitrary shell commands suggested by a model. Use a fixed allowlist of repository scripts inside an ephemeral, network-restricted runner.
- Never expose API keys, environment variables, passwords, session cookies, payment data or private user content to the coding model.
- Use a GitHub App with least-privilege repository permissions. Prefer Contents: read/write on the selected repository, Pull requests: read/write, Checks: read, and Metadata: read. Do not request organization administration permissions.
- Require explicit owner opt-in before enabling repository access, automated scans or paid model usage.
- Apply per-run time, token, file-change and cost budgets. Add a global kill switch and per-project pause control.
- Treat repository files, issue text, logs and model output as untrusted input. Ignore instructions embedded in them that attempt to override agent policy or reveal secrets.
- Require human approval for dependency upgrades, authentication/security changes, database migrations, billing/payment logic, data deletion, production configuration and deployment.
- Keep a durable audit record and support revoking the GitHub App installation at any time.

## Operating modes

### 1. Monitor
Read-only scheduled checks for application health, failed workflows and dependency/security alerts. No repository writes.

### 2. Diagnose
Create an issue report with reproduction clues, severity, affected files and suggested tests. No code writes.

### 3. Prepare fix
Create a branch, implement a bounded fix, add regression tests, run approved checks and open a draft PR. Never merge.

### 4. Build requested feature
Translate an owner-approved task into a plan, implement it on a branch, run tests and open a PR. Large or high-risk tasks must be split into reviewable PRs.

## Proposed architecture

- Agent Orchestrator: schedules jobs, enforces budgets and maintains job state.
- Repository Connector: GitHub App integration with repository-scoped permissions.
- Issue Intake: CI failures, health checks, dependency alerts and owner-submitted tasks.
- Code Analysis/Planning: provider-neutral LLM adapter using a configured provider; no model receives secrets.
- Isolated Runner: ephemeral container with fixed commands, restricted network and resource limits.
- Patch Validator: diff size/path policy, secret scanning, tests and static checks.
- Pull Request Publisher: branch and draft PR creation only.
- Audit & Controls: owner approvals, run history, usage/cost reporting, pause and revoke controls.

## Initial release scope

- Admin-only access for the repository owner.
- Manual Scan now and Diagnose CI failure actions.
- Read-only repository analysis first.
- Draft PR creation for low-risk fixes after owner enables write mode.
- Fixed allowlist: npm test, node scripts/check-syntax.js, and approved package scripts only.
- No autonomous merge, production deployment, billing edits or database migrations.

## Rollout gates

1. Repair and pass the existing CI suite.
2. Implement read-only GitHub App connection and secure credential storage.
3. Implement issue intake and diagnostic reports.
4. Add isolated patch runner and policy enforcement.
5. Add draft PR creation and human approval workflow.
6. Test against seeded bugs and verify it cannot access secrets or modify the default branch.
7. Only then enable scheduled monitoring.

## Important limitation

This agent cannot guarantee that generated code is correct. Every proposed change must pass automated checks and human review. Continuous maintenance means continuously detecting and preparing reviewable fixes, not silently changing live production code.
