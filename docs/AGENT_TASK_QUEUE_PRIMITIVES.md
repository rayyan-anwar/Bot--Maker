# Agent Lab task queue primitives (prototype)

The `AgentTaskQueue` module provides a dependency-free, bounded in-memory task queue prototype for future worker integration.

Implemented behaviors:
- queue capacity and JSON payload/result size bounds
- owner-scoped idempotency keys
- FIFO claim for ready tasks
- worker lease and heartbeat
- lease-owner-gated completion/failure
- bounded retries with delay
- expired lease recovery
- owner-scoped cancellation
- isolated task snapshots

**Important:** this queue is process-local and in-memory. It is not durable, shared across workers, or integrated into Agent Lab HTTP routes yet. Use it as a tested primitive/prototype, not as production queue infrastructure.

Run tests with `npm test`.
