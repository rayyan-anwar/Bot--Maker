'use strict';

const LABELS = Object.freeze({
  warning: 'Budget warning',
  critical: 'Budget critical',
  exhausted: 'Budget exhausted',
  normal: 'Budget recovered',
  unknown: 'Budget status unavailable',
});
function safeText(value, fallback = 'unknown', maxLength = 120) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const cleaned = value.replace(/<[^>]*>/g, '').replace(/[\\x0d\\x0a\\x09]+/g, ' ').replace(/[\\u0000-\\u001f\\u007f]/g, ' ').trim().slice(0, maxLength);
  return cleaned || fallback;
}
function money(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const code = safeText(currency, '', 8).toUpperCase();
  return code ? amount.toFixed(2) + ' ' + code : amount.toFixed(2);
}
function formatBudgetAlert({status,scopeLabel,percentUsed,limitAmount,reservedAmount=0,spentAmount=0,currency}={}) {
  const state = Object.hasOwn(LABELS, status) ? status : 'unknown';
  const percent = Number(percentUsed);
  const validPercent = Number.isFinite(percent) && percent >= 0;
  const total = money(limitAmount,currency);
  const reserved = money(reservedAmount,currency);
  const spent = money(spentAmount,currency);
  return {
    title: LABELS[state],
    status: state,
    scope: safeText(scopeLabel,'Budget scope'),
    usage: validPercent ? Math.round(percent*100)/100 + '%' : 'unavailable',
    limit: total || 'unavailable',
    reserved: reserved || 'unavailable',
    spent: spent || 'unavailable',
    message: state === 'normal' ? 'Budget is below configured alert thresholds.' :
      state === 'unknown' ? 'Budget alert evaluation could not be completed.' : LABELS[state] + ' threshold reached.',
  };
}
module.exports = { formatBudgetAlert };
