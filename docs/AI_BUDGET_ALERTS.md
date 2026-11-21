# AI budget alert thresholds

The pure alert evaluator in `server/ai-budget-alerts.js` calculates budget consumption from **reserved + spent** amounts and reports the highest crossed threshold.

| Threshold | Level | Intended response |
|---:|---|---|
| 70% | warning | Notify operators; review usage trend and active reservations |
| 85% | critical | Escalate; investigate costly models or abnormal traffic |
| 100%+ | exhausted | Treat the scope as consumed; enforcement should prevent new reservations |

The evaluator intentionally does not deliver notifications or enforce spending limits. It is a deterministic calculation layer, not a complete alerting pipeline.

## Data behavior

- Invalid, negative, non-finite, or zero-limit input produces `unknown`.
- Reserved funds are included because provider calls may still be in flight.
- Consumption over 100% is preserved in the percentage result (for example, 130%).
- Alert status is a snapshot. Callers must refresh the budget data before making enforcement decisions.

## Integration gates

Before production use, integrate this calculation with the authenticated admin budget summary and implement persistent alert deduplication, notification delivery, per-scope alert history, and alert reset/recovery semantics. Verify PostgreSQL transactions, concurrent reservation behavior, and the emergency-stop interaction. No notifications are active merely because this evaluator exists.
