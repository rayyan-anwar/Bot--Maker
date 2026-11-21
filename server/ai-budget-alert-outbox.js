'use strict';

const MAX_BATCH_SIZE = 100;
const MIN_LEASE_SECONDS = 10;
const MAX_LEASE_SECONDS = 900;
const MAX_RETRY_SECONDS = 86400;

async function claimBudgetAlertOutbox(query, { batchSize = 20, leaseSeconds = 60 } = {}) {
  if (typeof query !== 'function') throw new TypeError('A PostgreSQL query adapter is required.');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) throw new RangeError('batchSize must be an integer from 1 to 100.');
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < MIN_LEASE_SECONDS || leaseSeconds > MAX_LEASE_SECONDS) throw new RangeError('leaseSeconds must be an integer from 10 to 900.');
  const result = await query('SELECT * FROM botforge_claim_ai_budget_alert_outbox($1,$2)', [batchSize, leaseSeconds]);
  return result.rows;
}

async function finishBudgetAlertOutbox(query, id, { delivered, error = null, retrySeconds = 60, maxAttempts = 5 } = {}) {
  if (typeof query !== 'function') throw new TypeError('A PostgreSQL query adapter is required.');
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new TypeError('A valid outbox UUID is required.');
  if (typeof delivered !== 'boolean') throw new TypeError('delivered must be a boolean.');
  if (error !== null && (typeof error !== 'string' || error.length > 2000)) throw new TypeError('error must be a string of at most 2,000 characters.');
  if (!Number.isInteger(retrySeconds) || retrySeconds < 1 || retrySeconds > MAX_RETRY_SECONDS) throw new RangeError('retrySeconds must be an integer from 1 to 86,400.');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new RangeError('maxAttempts must be an integer from 1 to 10.');
  const result = await query('SELECT botforge_finish_ai_budget_alert_outbox($1,$2,$3,$4,$5) AS result', [id, delivered, error, retrySeconds, maxAttempts]);
  return result.rows[0]?.result || null;
}

module.exports = { claimBudgetAlertOutbox, finishBudgetAlertOutbox, MAX_BATCH_SIZE, MIN_LEASE_SECONDS, MAX_LEASE_SECONDS, MAX_RETRY_SECONDS };
