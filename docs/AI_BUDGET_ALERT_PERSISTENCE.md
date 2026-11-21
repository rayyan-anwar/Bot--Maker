# AI budget alert persistence and admin integration

Migration 012 stores one latest alert snapshot per budget scope and a transition-only event history.

- `ai_budget_alert_state` stores the latest status and snapshot.
- `ai_budget_alert_events` stores initial non-normal states, escalations, downgrades, recovery and evaluation-unavailable transitions.
- `ai_budget_alert_outbox` queues one immutable payload per transition event in the same database function call; duplicate event IDs are ignored.
- `botforge_record_ai_budget_alert` serializes concurrent writes for a scope through PostgreSQL row locking. Repeated identical statuses update the latest snapshot without creating duplicate events.
- Admin `GET /api/admin/ai-budget/summary` now evaluates scopes, persists alert state and returns per-scope alert summaries plus counts. It requires PostgreSQL and administrator authentication.
- Admin `GET /api/admin/ai-budget/alerts/history?limit=50&scopeId=<uuid>` returns bounded transition history (limit 1–100), optionally scoped to a UUID.

This is an authenticated admin snapshot endpoint, not an external delivery service. No email, push, webhook or SMS notifications are sent. Budget scope evaluation is capped at 5,000 scopes per summary request; the response reports truncation when the cap is reached. A repeated status is suppressed from history; status recovery is retained as an event. Unknown evaluation results are persisted as unknown and are not treated as healthy.

Test migration runner applies migration 012. PostgreSQL tests verify transition recording, recovery, duplicate suppression and concurrent identical snapshots.
