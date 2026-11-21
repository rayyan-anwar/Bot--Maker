# AI budget alert dispatcher

The dispatcher in `server/ai-budget-alert-dispatcher.js` processes one bounded batch from the PostgreSQL outbox using the lease and retry primitives from migration 013.

## Safety contract

- A delivery adapter must be passed explicitly. The dispatcher has no built-in email, SMS, push or webhook integration and sends nothing by itself.
- The adapter receives the stored payload and an `outboxId`/event ID context. Use that stable identifier as the provider idempotency key whenever supported.
- The adapter must return the boolean `true` only after the provider confirms acceptance. Any other result is treated as a delivery failure and retried.
- Delivery is at-least-once. A worker can crash after provider acceptance but before the database records completion; provider-side idempotency is therefore important.
- One call handles at most the configured claim batch (1–100, enforced by the claim adapter). A scheduler or worker process must be configured separately; this module does not start one.
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

Do not configure a provider adapter until credentials, recipient policy, privacy review, idempotency behavior and operational monitoring are in place.
