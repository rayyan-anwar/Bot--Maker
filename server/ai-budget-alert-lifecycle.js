'use strict';

const RANK = Object.freeze({ normal: 0, warning: 1, critical: 2, exhausted: 3 });
const VALID = new Set([...Object.keys(RANK), 'unknown']);

function normalizeStatus(value) {
  return VALID.has(value) ? value : 'unknown';
}

/**
 * Pure lifecycle reducer. Persistence/delivery/deduplication are the caller's responsibility.
 * Emits a transition only when the alert state changes, so repeated snapshots are quiet.
 */
function transitionBudgetAlert(previousStatus, currentStatus) {
  const previous = normalizeStatus(previousStatus);
  const current = normalizeStatus(currentStatus);
  if (previous === current) return { changed: false, event: null, previous, current };
  if (current === 'unknown') return { changed: true, event: 'evaluation_unavailable', previous, current };
  if (previous === 'unknown') {
    return { changed: true, event: current === 'normal' ? 'recovered' : 'threshold_reached', previous, current };
  }
  if (current === 'normal') return { changed: true, event: 'recovered', previous, current };
  if (RANK[current] > RANK[previous]) return { changed: true, event: 'escalated', previous, current };
  return { changed: true, event: 'downgraded', previous, current };
}

module.exports = { transitionBudgetAlert, normalizeStatus };
