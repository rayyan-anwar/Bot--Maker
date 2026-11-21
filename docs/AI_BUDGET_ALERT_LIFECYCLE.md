# AI Budget Alert Lifecycle

This module defines a deterministic state transition helper for budget alert snapshots. It does not persist state, send notifications, or enforce provider spending.

## State transitions

- Same state: no event (deduplication at the reducer level).
- Normal to warning/critical/exhausted: escalation.
- Threshold increase: escalation.
- Threshold decrease: downgrade.
- Any known alert to normal: recovery.
- Evaluation unavailable: explicit `evaluation_unavailable`; it must not be treated as normal.
- Unknown to a known threshold: `threshold_reached`.

## Integration requirements

A production caller must persist the current state per budget scope, atomically compare-and-update it, and enqueue notification events through an outbox to avoid duplicate delivery across replicas. Delivery retries need idempotency keys. Alert records must not include provider secrets or user prompt content. Configure quieting/rate limits for repeated notifications and expose alert history to authorized admins.

The reducer is intentionally pure so these storage and delivery concerns can be implemented and tested independently.
