'use strict';

const THRESHOLDS = Object.freeze([
  { percent: 100, level: 'exhausted', message: 'Budget is fully consumed or exceeded.' },
  { percent: 85, level: 'critical', message: 'Budget consumption has reached at least 85%.' },
  { percent: 70, level: 'warning', message: 'Budget consumption has reached at least 70%.' },
]);

function finiteNonNegative(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function evaluateBudgetAlert({ limitAmount, reservedAmount = 0, spentAmount = 0 } = {}) {
  const limit = finiteNonNegative(limitAmount), reserved = finiteNonNegative(reservedAmount), spent = finiteNonNegative(spentAmount);
  if (limit === null || reserved === null || spent === null || limit <= 0) {
    return { status: 'unknown', percentUsed: null, threshold: null, level: 'none', message: 'Budget alert cannot be evaluated from invalid or zero-limit values.' };
  }
  const consumed = reserved + spent;
  const percentUsed = (consumed / limit) * 100;
  if (!Number.isFinite(percentUsed)) return { status: 'unknown', percentUsed: null, threshold: null, level: 'none', message: 'Budget alert calculation exceeded the supported numeric range.' };
  const threshold = THRESHOLDS.find(item => percentUsed >= item.percent) || null;
  return {
    status: threshold ? threshold.level : 'normal',
    percentUsed: Math.round(percentUsed * 100) / 100,
    threshold: threshold ? threshold.percent : null,
    level: threshold ? threshold.level : 'none',
    message: threshold ? threshold.message : 'Budget consumption is below alert thresholds.',
  };
}
module.exports = { THRESHOLDS, evaluateBudgetAlert };
