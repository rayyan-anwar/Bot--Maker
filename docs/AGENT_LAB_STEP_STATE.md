# Agent Lab step state machine

Plans are initialized with per-step statuses: pending, retry count, start/completion timestamps, and bounded error metadata. Owner-scoped authenticated status endpoint: `POST /agents/:runId/steps/:stepIndex/status`, available only for approved runs.

Allowed transitions:
- pending -> running
- running -> completed, failed, or cancelled
- failed -> pending (maximum two retries)

The dashboard shows completed/total progress and buttons to start, complete, fail, or retry steps. A cancelled run marks its pending/running steps cancelled. This is state tracking and user-driven controls only; it does not automatically execute plan steps or claim autonomous completion. Concurrent status updates are not yet serialized with a database lock.
