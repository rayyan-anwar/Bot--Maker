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
- JSON development adapter for local test/development

## Task record
Tasks use `kind: agent-task` in the existing record store and include `taskType`, `payload`, status, attempt/maxAttempts, availability, lease fields, timestamps, last error and optional idempotency key.

## Status
This is a service foundation, not a complete background execution system yet. It does not expose API routes, start a worker loop, execute task handlers, or provide durable idempotency uniqueness across concurrent enqueue calls. The JSON development store is not concurrency-safe for multi-worker operation. PostgreSQL is required for reliable concurrent claims.

## Service functions
`enqueueTask`, `listUserTasks`, `getTaskForUser`, `claimTask`, `heartbeatTask`, `completeTask`, `failTask`, `cancelTask`, `recoverExpiredTasks`.
