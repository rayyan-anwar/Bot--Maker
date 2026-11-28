# AI budget alert outbox leases and retries

Migration 013 adds a lease-based lifecycle to the transition outbox.

- `botforge_claim_ai_budget_alert_outbox(batch_size, lease_seconds)` atomically claims due rows with `FOR UPDATE SKIP LOCKED`. Batch size is 1–100 and leases are 10–900 seconds.
- Claimed rows move to `attempted`, increment attempts, and receive a lease. If a worker exits before finishing, an expired lease makes the row claimable again.
- `botforge_finish_ai_budget_alert_outbox(id, delivered, error, retry_seconds, max_attempts)` marks success as delivered, schedules a bounded retry, or moves exhausted attempts to failed.
- The Node adapter validates identifiers and all numeric bounds before calling PostgreSQL.
- CI includes PostgreSQL tests for exclusive concurrent claims, delayed retries, success, terminal failure and expired-lease recovery.

This change provides reliable queue primitives only. It does not send email, SMS, push or webhooks, and it does not start a background worker. A delivery adapter must be explicitly configured and must use provider idempotency where supported. Delivery is at-least-once: a worker can crash after a provider accepts a message but before the database records success.


## Automatic transitions and email worker

Migration 014 attaches an `AFTER INSERT OR UPDATE` trigger to budget scopes. Changes to limit, reserved amount or spent amount now evaluate thresholds and record transitions automatically; alert creation no longer depends on an administrator opening the budget summary page.

The optional `server/ai-budget-alert-worker.js` drains the outbox with the existing leases and bounded retries. It uses the Resend adapter in `server/ai-budget-alert-email.js` and sends plain-text alerts to `BOTFORGE_BUDGET_ALERT_EMAIL_TO`, falling back to `BOTFORGE_ADMIN_EMAIL`.

Enable only after configuring `RESEND_API_KEY`, `BOTFORGE_EMAIL_FROM`, a valid recipient, PostgreSQL and `BOTFORGE_BUDGET_ALERT_WORKER=1`. The worker is disabled by default. CI uses mocked provider responses; configure a verified sender domain and test real delivery in staging before relying on alerts.

Delivery remains at-least-once. A provider acceptance followed by a lost response can cause a duplicate email; do not interpret outbox retries as exactly-once delivery.
