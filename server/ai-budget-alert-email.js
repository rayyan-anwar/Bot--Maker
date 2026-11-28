'use strict';

const { formatBudgetAlert } = require('./ai-budget-alert-message');

function configuration(env = process.env) {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const from = String(env.BOTFORGE_EMAIL_FROM || '').trim();
  const to = String(env.BOTFORGE_BUDGET_ALERT_EMAIL_TO || env.BOTFORGE_ADMIN_EMAIL || '').trim();
  if (!apiKey || !from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return null;
  return { apiKey, from, to };
}

function isBudgetAlertDeliveryConfigured(env = process.env) {
  return !!configuration(env);
}

function alertText(payload, eventId) {
  const snapshot = payload?.snapshot && typeof payload.snapshot === 'object' && !Array.isArray(payload.snapshot) ? payload.snapshot : {};
  const alert = formatBudgetAlert({
    status: payload?.current || snapshot.status,
    scopeLabel: snapshot.scopeLabel,
    percentUsed: snapshot.percentUsed,
    limitAmount: snapshot.limitAmount,
    reservedAmount: snapshot.reservedAmount,
    spentAmount: snapshot.spentAmount,
    currency: snapshot.currency,
  });
  return [
    alert.title,
    '',
    'Scope: ' + alert.scope,
    'Status: ' + alert.status,
    'Usage: ' + alert.usage,
    'Budget limit: ' + alert.limit,
    'Reserved: ' + alert.reserved,
    'Spent: ' + alert.spent,
    'Event: ' + String(payload?.eventType || 'unknown').slice(0, 40),
    'Event ID: ' + String(eventId || payload?.eventId || 'unavailable').slice(0, 80),
    '',
    alert.message,
  ].join('\n');
}

async function sendBudgetAlertEmail(payload, context = {}, env = process.env) {
  const config = configuration(env);
  if (!config) throw new Error('Budget alert email delivery is not configured.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('A budget alert payload is required.');
  const eventId = typeof context.eventId === 'string' ? context.eventId : payload.eventId;
  const text = alertText(payload, eventId);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + config.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: config.from,
      to: [config.to],
      subject: 'BotForge AI budget alert: ' + formatBudgetAlert({ status: payload.current || payload.snapshot?.status }).title,
      text,
    }),
    signal: AbortSignal.timeout(12000),
  });
  let result = null;
  try { result = await response.json(); } catch (_) {}
  if (!response.ok || typeof result?.id !== 'string' || !result.id) throw new Error('Budget alert email provider did not confirm acceptance.');
  return true;
}

module.exports = { configuration, isBudgetAlertDeliveryConfigured, alertText, sendBudgetAlertEmail };
