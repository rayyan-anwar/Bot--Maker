# Agent Lab Durable Task Service and Worker

This service adds durable task records to the existing `aiEngineerRuns` store and provides an opt-in worker for approved plan execution.

## Implemented foundation
- Owner-scoped enqueue, list, detail, cancel and approved-plan execute endpoints.
- Idempotency keys scoped by owner. PostgreSQL insertion uses a transaction-scoped advisory lock and a uniqueness index; JSON adapter serializes enqueue mutations within a single process.
- Payload/result bounds and per-owner active-task limits.
- PostgreSQL atomic task claim using row locking and `SKIP LOCKED`.
- Worker leases, heartbeat, guarded status transitions, retries/backoff and expired-lease recovery.
- Worker lifecycle is opt-in with `BOTFORGE_AGENT_WORKER=1`.
- Sequential approved-plan execution with step status, output persistence, retry resumption, cancellation checks, budget reservations and Fortisni event/log updates.
- JSON adapter for development and single-process use. Unique temporary filenames reduce write-file rename collisions, but this adapter is not safe for multi-process/multi-worker coordination.

## Task API
- `POST /api/agents/tasks`: enqueue an allowed task type.
- `GET /api/agents/tasks`: list tasks owned by the current user.
- `GET /api/agents/tasks/:taskId`: fetch an owned task.
- `POST /api/agents/tasks/:taskId/cancel`: cancel an owned task.
- `POST /api/agents/:runId/execute`: queue an approved plan.

## Task record and worker
Tasks are stored with `kind: agent-task`, `taskType`, bounded payload, status, attempts, availability, lease owner/expiry, timestamps, error summary and optional idempotency key. Worker handlers are explicitly registered. The built-in plan executor supports research/analyze/draft/review/decide steps, but provider generation is not external browsing and cannot perform arbitrary real-world actions. It must not claim tools or external actions it did not execute.

## Configuration
- `BOTFORGE_AGENT_WORKER=1`: enable worker startup.
- `AGENT_WORKER_POLL_MS`: polling interval.
- `AGENT_WORKER_LEASE_MS`: worker lease duration.
- `AGENT_WORKER_SHUTDOWN_TIMEOUT_MS`: graceful worker stop timeout.

PostgreSQL is the intended backend for reliable concurrent claims, shared worker coordination, and production use. JSON storage is a development fallback only.

## Production validation still required
- Run the full CI matrix on the current PR head and resolve all failures.
- Validate PostgreSQL integration tests against a provisioned test database.
- Exercise staging enqueue/claim/heartbeat/retry/cancel/recovery and shutdown behavior with multiple workers.
- Verify budget ledger reconciliation and provider failure paths.
- Review tenant isolation, rate limits, secrets, monitoring and deployment configuration before production.
- Do not merge or deploy based solely on unit tests.
