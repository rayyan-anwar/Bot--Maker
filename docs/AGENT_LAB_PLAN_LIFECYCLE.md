# Agent Lab plan lifecycle

Agent Lab now exposes authenticated, owner-scoped lifecycle endpoints:

- `POST /api/agents/plan`: generate and persist a bounded plan.
- `GET /api/agents/mine`: list the signed-in user's latest plans.
- `GET /api/agents/:runId`: retrieve an owned plan.
- `POST /api/agents/:runId/approve`: transition a plan from `planned` to `approved`.
- `POST /api/agents/:runId/cancel`: transition a plan from `planned` or `approved` to `cancelled`.

Status transitions are conditional and atomic in PostgreSQL. Only the record owner can transition or read a plan. Repeated or stale transitions return HTTP 409; missing or non-owned records return HTTP 404.

Approval is a review decision only. It does not execute tools, commands, external API calls, repository modifications, browsing or messages. The response explicitly states that no actions were executed. An execution engine must be introduced separately with a permission registry, per-action approvals, sandboxing, audit logs, cancellation and resource limits before any tools can run.
