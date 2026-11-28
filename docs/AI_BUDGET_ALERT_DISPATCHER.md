# AI budget alert dispatcher

The dispatcher in `server/ai-budget-alert-dispatcher.js` processes one bounded batch from the PostgreSQL outbox using the lease and retry primitives from migration 013. The optional application worker in `server/ai-budget-alert-worker.js` schedules this dispatcher and uses the Resend adapter in `server/ai-budget-alert-email.js`.

## Safety contract

- The dispatcher remains transport-agnostic and requires an explicit adapter. BotForge now supplies an optional Resend email adapter; SMS, push and webhook delivery are not implemented.
- The adapter receives the stored payload and an `outboxId`/event ID context. Use that stable identifier as the provider idempotency key whenever supported.
- The adapter must return the boolean `true` only after the provider confirms acceptance. Any other result is treated as a delivery failure and retried.
- Delivery is at-least-once. A worker can crash after provider acceptance but before the database records completion; provider-side idempotency is therefore important.
- One call handles at most the configured claim batch (1–100, enforced by the claim adapter). The optional worker starts only when PostgreSQL, Resend configuration and `BOTFORGE_BUDGET_ALERT_WORKER=1` are present; it is disabled by default.
- Database completion errors are propagated. The lease will eventually expire and the event can be reclaimed.

## Example

```js
const { dispatchBudgetAlertOutbox } = require('./ai-budget-alert-dispatcher');
const summary = await dispatchBudgetAlertOutbox(store.query, configuredProviderAdapter, {
  batchSize: 20,
  leaseSeconds: 60,
  retrySeconds: 120,
  maxAttempts: 5,
});
```

Configure a verified Resend sender, recipient policy, privacy review and monitoring before enabling the worker. Delivery is at-least-once, not exactly-once.
