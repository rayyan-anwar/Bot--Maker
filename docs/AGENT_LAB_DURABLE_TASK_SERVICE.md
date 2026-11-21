# Agent Lab Durable Task Service (foundation)

This module adds persistent task records to the existing `aiEngineerRuns` store without changing the current plan lifecycle.

## Included
- Owner-scoped task creation and listing
- Idempotency key deduplication scoped to user
- Bounded JSON payload/result sizes
- Active task cap per owner
- PostgreSQL atomic claim using `FOR UPDATE SKIP LOCKED`
- Worker leases, heartbeat, completion, retry/failure and expiry recovery
- Owner-only cancellation and public task projection
- Authenticated task create/list/detail/cancel HTTP endpoints
- Rate limiting on task creation and cancellation
- JSON development adapter for local test/development

## Task record
Tasks use `kind: agent-task` in the existing record store and include `taskType`, `payload`, status, attempt/maxAttempts, availability, lease fields, timestamps, last error and optional idempotency key.

## Status
This is a service foundation, not a complete background execution system yet. The authenticated task API is wired in, but it does not start a worker loop or execute task handlers yet. Idempotency is application-level and can race under concurrent enqueue; a database uniqueness guard is still needed. The JSON development store is not concurrency-safe for multi-worker operation. PostgreSQL is required for reliable concurrent claims.

## Service functions
`enqueueTask`, `listUserTasks`, `getTaskForUser`, `claimTask`, `heartbeatTask`, `completeTask`, `failTask`, `cancelTask`, `recoverExpiredTasks`.
