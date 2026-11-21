# Agent Lab plan step tracking

Plan steps begin in pending status and expose explicit owner-authenticated status transitions on approved plans.

Supported transitions:
- pending -> running
- running -> completed, failed, or cancelled
- failed -> pending (maximum two retries)

Each step records retry count, start/completion timestamps, and bounded error metadata. Progress totals completed, failed, running, and pending steps. Cancelling a run marks unfinished steps cancelled.

This feature is user-driven progress tracking; it does not autonomously execute the plan. Concurrent state updates are not yet protected by a database compare-and-swap or row lock.
