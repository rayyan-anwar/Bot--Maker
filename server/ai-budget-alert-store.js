'use strict';

const VALID_STATUSES = new Set(['normal','warning','critical','exhausted','unknown']);

/**
 * Persist a snapshot through a database function that serializes per-scope transitions.
 * The function is PostgreSQL-only and returns null when the query adapter is unavailable.
 */
async function recordBudgetAlertSnapshot(query, scopeId, status, snapshot) {
  if (typeof query !== 'function') throw new TypeError('A PostgreSQL query adapter is required.');
  if (typeof scopeId !== 'string' || !scopeId) throw new TypeError('A valid scope ID is required.');
  const normalized = VALID_STATUSES.has(status) ? status : 'unknown';
  const result = await query('SELECT botforge_record_ai_budget_alert($1::uuid,$2,$3::jsonb) AS transition',[
    scopeId, normalized, JSON.stringify(snapshot || {}),
  ]);
  return result.rows[0]?.transition || null;
}
module.exports = { recordBudgetAlertSnapshot, VALID_STATUSES };
