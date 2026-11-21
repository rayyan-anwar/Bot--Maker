# Agent Lab Durable Task Service and Worker (foundation)

This module adds persistent task records to the existing `aiEngineerRuns` store without changing the current plan lifecycle.

## Included
- Owner-scoped task creation and listing
- Idempotency key deduplication scoped to user
- Bounded JSON payload/result sizes
- Active task cap per owner
- PostgreSQL atomic claim using `FOR UPDATE SKIP LOCKED`
- Worker leases, heartbeat, completion, retry/failure and expiry recovery
- Owner-only cancellation and public task projection
- Authenticated task create/list/detail/cancel/execute HTTP endpoints
- Rate limiting on task creation, cancellation, and execution queueing
- Background worker with registered task handlers and opt-in startup
- Approved plan execution with per-step status, output persistence, budget reservations, and retry resumption
- JSON development adapter for local test/development

## Task record
Tasks use `kind: agent-task` in the existing record store and include `taskType`, `payload`, status, attempt/maxAttempts, availability, lease fields, timestamps, last error and optional idempotency key.

## Status
This is a service foundation, not a complete background execution system yet. The worker is opt-in and starts only with `BOTFORGE_AGENT_WORKER=1`. The built-in `agent.plan.execute` handler executes approved plan steps using the configured AI provider, records step outputs/progress, and resumes completed steps after task retries. It does not execute external tools, browse, or take external actions. Idempotency remains application-level and can race under concurrent enqueue; a database uniqueness guard is still needed. The JSON development store is not concurrency-safe for multi-worker operation. PostgreSQL is required for reliable concurrent claims.

## API and worker

- `POST /api/agents/tasks` enqueues an allowed task type (authenticated).
- `GET /api/agents/tasks` lists tasks owned by the user.
- `GET /api/agents/tasks/:taskId` returns a task only for its owner.
- `POST /api/agents/tasks/:taskId/cancel` cancels an owned task.
- `POST /api/agents/:runId/execute` queues an approved plan using a stable idempotency key.
- Set `BOTFORGE_AGENT_WORKER=1` to start the worker; worker polling/lease settings are configurable via `AGENT_WORKER_POLL_MS` and `AGENT_WORKER_LEASE_MS`.

## Service functions
`enqueueTask`, `listUserTasks`, `getTaskForUser`, `claimTask`, `heartbeatTask`, `completeTask`, `failTask`, `cancelTask`, `recoverExpiredTasks`.
