# AI usage, token and cost budget design

**Status:** Design proposal. This document does not change runtime behavior, set plan prices, or enable provider billing controls.

## Current baseline

The application currently reserves a daily message slot before a chat request and releases it on failure. Successful chat turns persist provider, model, input-token and output-token counts with the usage record. Daily message quotas are plan-based. This protects message volume, but it is not an aggregate token or monetary spend budget.

Provider adapters return token counts where the provider supplies them. A missing token count currently defaults to zero. Therefore zero must not be interpreted as proof that a request was free.

## Goals

- Prevent runaway per-user, per-tenant and global provider spend.
- Make usage visible and explainable to administrators and users.
- Keep limits configurable without code changes where practical.
- Fail closed before a provider call when a hard budget cannot be safely reserved.
- Reconcile estimates against actual provider usage after each response.
- Preserve the existing daily message quota as a separate control.

## Budget dimensions

Use independent configurable limits:
1. Requests/messages per day and per rolling session.
2. Input and output tokens per request.
3. Input and output tokens per user per day and billing period.
4. Estimated provider cost per request, user, tenant and global billing period.
5. Concurrent provider requests per user and globally.
6. Maximum provider wall-clock time and response size.
7. Separate quotas for expensive tools, image generation and other non-chat operations when those features are introduced.

Do not assume that all models share a token price or context window.

## Model pricing registry

Maintain a server-side, versioned registry keyed by provider and exact model identifier. Each entry should record:
- input price per million tokens;
- output price per million tokens;
- cached-input price, if applicable;
- currency and effective-from date;
- source URL or operator-provided evidence and last verification time;
- whether the entry is verified, estimated or unavailable.

Never infer a model's price from its display name. Do not expose provider credentials or internal pricing configuration to browser code.

If pricing is missing or stale, apply the configured conservative policy: block paid-provider requests, or allow only a separately configured hard token cap with an explicit unknown-cost warning. Do not silently record the cost as zero.

## Reservation and reconciliation lifecycle

1. Authenticate the user and resolve plan, tenant, provider and exact model.
2. Enforce daily message quota and per-request token/output caps.
3. Estimate worst-case cost using the configured model price and maximum input/output token allowance.
4. Atomically reserve the estimated cost and token allowance against user, tenant and global period budgets before calling the provider.
5. If any reservation fails, reject the request before provider execution.
6. Call the provider with bounded input, output tokens and timeout.
7. On success, record actual input/output tokens, provider/model, pricing-registry version, currency, estimated and reconciled cost, request ID and timestamps.
8. Atomically release unused reservation and charge actual usage. If actual usage exceeds reservation, record the overage and apply the configured hard-stop policy to subsequent requests.
9. On provider failure or cancellation, release the reservation. Record billable failed-attempt usage if the provider reports it.
10. A scheduled reconciliation process compares internal estimates with provider billing exports where available. Differences create an alert and do not silently rewrite historical usage.

All reservation operations must be idempotent and transactionally safe across multiple application instances. PostgreSQL is the production source of truth; process-local counters are not acceptable for global spend controls.

## Data and audit requirements

Store immutable usage events with:
- event and idempotency IDs;
- user/tenant identifiers;
- provider and exact model;
- input/output token counts and their source;
- pricing-registry version and effective date;
- reserved and reconciled amount, currency and reconciliation status;
- outcome, timestamps and bounded request correlation ID.

Do not store prompts, generated content, API keys or raw provider headers in budget/audit records. Define retention and deletion behavior for user-linked usage events before launch. Keep aggregate financial totals after personal data deletion only where lawful and documented.

## Admin and user experience

Admin controls should support:
- plan defaults and per-account overrides;
- per-model token and cost ceilings;
- per-user, per-tenant and global period budgets;
- warning thresholds (for example 70%, 85%, 100%);
- emergency global provider pause and per-provider pause;
- provider/model pricing updates with evidence and effective dates;
- exportable aggregate reports and alerts for unknown pricing, overages and reconciliation drift.

User dashboard should show:
- daily message usage and reset time;
- token usage when provider-reported counts are available;
- remaining plan allowance and any model-specific cap;
- a clear warning when a request is blocked by a budget limit.

Do not display fabricated currency costs when pricing is unknown.

## Failure behavior and abuse controls

- Budget store unavailable: reject paid-provider calls; never fall back to uncoordinated in-memory counters.
- Reservation conflict or duplicate request: return the prior idempotent result or a safe conflict response.
- Unknown model or pricing version: block or apply an explicitly configured conservative cap.
- Provider omits token usage: mark usage unknown and charge the reserved worst-case amount until reconciled; do not set actual usage to zero.
- Provider reports usage above the cap: persist the overage, alert operators and block further usage according to policy.
- Prevent users from choosing arbitrary model IDs or client-supplied prices.
- Rate-limit admin budget changes and record redacted before/after policy metadata.

## Rollout gates

1. Add schema and migration with idempotency and transactional reservation tests.
2. Add a deterministic pricing registry with fixture-based tests; no live price scraping in request paths.
3. Add unit and PostgreSQL concurrency tests for user, tenant and global budget contention.
4. Test provider success, timeout, cancellation, missing usage metadata, overage and duplicate reconciliation.
5. Add admin configuration and user-visible usage summaries.
6. Run staging tests with real provider credentials only after an explicit budget and spending cap are approved.
7. Reconcile staging usage against provider billing data and verify emergency pause behavior.
8. Keep hard limits conservative until observed costs and failure modes are understood.

## Decisions intentionally left open

- Plan prices and exact Free/Plus/Pro quotas.
- Currency and exchange-rate handling.
- Provider/model pricing values and verification cadence.
- Whether unknown pricing blocks all paid calls or permits a small capped trial allowance.
- Billing-period definition and rollover behavior.
- Retention period and financial reporting requirements.

No provider prices or commercial limits are invented by this design. Production budgets must be approved before live provider calls are enabled.
