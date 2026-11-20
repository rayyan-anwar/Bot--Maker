# Atomic AI Budget Reservation Design

## Purpose
Prevent concurrent model requests from exceeding configured spending limits. This document defines the PostgreSQL ledger contract before implementation.

## Budget scopes
- Global platform budget
- User budget
- Provider/model budget (optional scope, configurable)
- Reservation window (daily/monthly or rolling window)

Every request must be evaluated against all applicable scopes. Missing or invalid price data is **unknown**, not zero; requests requiring budget enforcement must fail closed when a reliable maximum reservation cannot be calculated.

## Request lifecycle
1. Resolve provider/model pricing from a versioned server-side catalogue.
2. Validate token caps and compute a conservative maximum reservation using the cost estimator.
3. In a single database transaction, lock the budget rows in a deterministic order (scope type + scope identifier) to avoid deadlocks.
4. Re-read each scope's limit, committed spend, and outstanding reservations.
5. Reject if any scope would exceed its limit; otherwise create a reservation ledger record and increment reserved totals atomically.
6. Only after commit may the provider request be sent.
7. On completion, reconcile actual usage/cost and transition reservation to settled; release unused reservation.
8. On provider failure/timeout, release or retain a bounded reservation according to outcome policy. Unknown outcomes (timeout after request was sent) must remain conservatively reserved until reconciliation or expiry policy resolves them.

## Ledger states
- reserved: funds/cost capacity held before provider call
- settled: actual usage recorded; reservation replaced by actual charge
- released: reservation returned without charge
- expired: reservation released only by an explicit safe expiry/reconciliation process

State transitions must be idempotent and guarded by a unique request/idempotency key. Terminal states cannot be re-settled or re-released.

## Suggested schema (migration review required)
- ai_budget_scopes: id, scope_type, scope_key, currency, limit_amount, window_start, window_end, reserved_amount, spent_amount, updated_at; unique scope/window key
- ai_budget_reservations: id, request_key unique, scope_id, model_id, pricing_version, input_token_cap, output_token_cap, reserved_amount, actual_amount nullable, state, provider_request_id nullable, created_at, settled_at, released_at, expires_at
- ai_budget_ledger_entries: append-only event rows for reserve, settle, release, adjustment; reservation_id, scope_id, event_type, amount_delta, currency, request_key, metadata_redacted, created_at

Use integer minor units or a fixed-precision numeric type (never floating-point money). Currency must be consistent within a scope. Any multi-scope reservation must commit or roll back together.

## Concurrency & consistency
- Use SERIALIZABLE isolation or explicit row locks (SELECT ... FOR UPDATE) with a documented retry policy for serialization/deadlock failures.
- Lock scopes in deterministic order across requests.
- Enforce non-negative reserved/spent balances and limits with database constraints where possible.
- Idempotency keys must be unique at the database level.
- The reservation check and write must occur in the same transaction; a pre-check outside the transaction is unsafe.

## Reconciliation
Actual provider usage may differ from estimates. On settlement:
- Record actual input/output tokens and pricing version.
- Calculate actual cost with the same versioned pricing record.
- Atomically remove reservation and add actual spend.
- Reject duplicate settlement events.
- If actual cost exceeds reserved capacity, record the overage and trigger alert/guardrails; do not silently discard it.

## Fail-safe behavior
- Missing pricing, currency mismatch, database outage, invalid token cap, or inability to reserve: deny the provider call and return a safe error.
- Emergency pause is checked before reservation and again at the provider dispatch boundary.
- Never log API keys, full prompts, or sensitive user content in budget events.
- Admin adjustments require an audit event with actor, reason, timestamp, and before/after values.

## Implementation sequence
1. Pricing estimator and tests (current standalone PR).
2. SQL migration and constraints.
3. Atomic multi-scope reservation/release functions.
4. Provider dispatch integration with fail-closed semantics.
5. Usage reconciliation/idempotency.
6. Admin budget controls, audit trail, emergency pause.
7. Concurrency tests (parallel requests racing for a small budget), failure-injection tests, and CI.

## Acceptance criteria
- Concurrent reservations cannot overspend a scope.
- Idempotent reserve/settle/release operations do not double-charge or double-release.
- All applicable scopes are checked atomically.
- Unknown pricing never grants free usage.
- Database/provider failures fail closed.
- Reservation and settlement events are auditable without exposing secrets.
- Tests cover race conditions, retry behavior, provider timeout ambiguity, and actual-cost over-reservation/under-reservation.
