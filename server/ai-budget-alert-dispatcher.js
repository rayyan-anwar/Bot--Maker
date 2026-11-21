'use strict';

const { claimBudgetAlertOutbox, finishBudgetAlertOutbox } = require('./ai-budget-alert-outbox');

const MAX_ERROR_LENGTH = 2000;

/**
 * Process one bounded outbox batch. Delivery is deliberately dependency-injected:
 * this module never sends email, SMS, push or webhooks by itself.
 *
 * A delivery adapter must resolve to true only after its provider confirms acceptance.
 * Delivery is at-least-once; adapters should use the outbox event ID as an idempotency key.
 */
async function dispatchBudgetAlertOutbox(query, deliver, options = {}) {
  if (typeof deliver !== 'function') throw new TypeError('An explicit delivery adapter is required.');
  const {
    batchSize = 20,
    leaseSeconds = 60,
    retrySeconds = 60,
    maxAttempts = 5,
  } = options;

  const claimed = await claimBudgetAlertOutbox(query, { batchSize, leaseSeconds });
  const summary = { claimed: claimed.length, delivered: 0, retried: 0, failed: 0, ignored: 0, errors: [] };

  for (const row of claimed) {
    if (!row || typeof row.id !== 'string' || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) {
      summary.ignored += 1;
      summary.errors.push({ id: typeof row?.id === 'string' ? row.id : null, error: 'Claimed outbox row has an invalid payload.' });
      continue;
    }

    let accepted = false;
    let deliveryError = null;
    try {
      accepted = (await deliver(row.payload, { eventId: row.event_id, outboxId: row.id, attempt: row.attempts })) === true;
      if (!accepted) deliveryError = 'Delivery adapter did not confirm acceptance.';
    } catch (error) {
      deliveryError = String(error?.message || 'Delivery adapter failed.').slice(0, MAX_ERROR_LENGTH);
    }

    const outcome = await finishBudgetAlertOutbox(query, row.id, {
      delivered: accepted,
      error: deliveryError,
      retrySeconds,
      maxAttempts,
    });

    if (!outcome || outcome.updated !== true) {
      summary.ignored += 1;
      summary.errors.push({ id: row.id, error: 'Outbox completion was not recorded.' });
    } else if (outcome.state === 'delivered') {
      summary.delivered += 1;
    } else if (outcome.state === 'pending') {
      summary.retried += 1;
    } else if (outcome.state === 'failed') {
      summary.failed += 1;
    } else {
      summary.ignored += 1;
    }
  }

  return summary;
}

module.exports = { dispatchBudgetAlertOutbox, MAX_ERROR_LENGTH };
