'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  configuration,
  isBudgetAlertDeliveryConfigured,
  alertText,
  sendBudgetAlertEmail,
} = require('../server/ai-budget-alert-email');
const { startWorker } = require('../server/ai-budget-alert-worker');

const env = {
  RESEND_API_KEY: 're_test_key',
  BOTFORGE_EMAIL_FROM: 'BotForge <alerts@example.test>',
  BOTFORGE_BUDGET_ALERT_EMAIL_TO: 'owner@example.test',
};

test('budget alert email configuration requires a provider key, sender and valid recipient', () => {
  assert.equal(configuration({}).toString(), '[object Object]');
  assert.equal(isBudgetAlertDeliveryConfigured(env), true);
  assert.equal(isBudgetAlertDeliveryConfigured({ ...env, BOTFORGE_BUDGET_ALERT_EMAIL_TO: 'not-an-email' }), false);
  assert.equal(isBudgetAlertDeliveryConfigured({ ...env, RESEND_API_KEY: '' }), false);
});

test('budget alert email contains bounded operational details, not secrets or HTML', () => {
  const text = alertText({
    current: 'critical',
    eventType: 'escalated',
    snapshot: {
      scopeLabel: 'global: production',
      percentUsed: 88.5,
      limitAmount: 100,
      reservedAmount: 20,
      spentAmount: 68.5,
      currency: 'USD',
    },
  }, 'event-123');
  assert.match(text, /Budget critical/);
  assert.match(text, /88\.5%/);
  assert.match(text, /event-123/);
  assert.doesNotMatch(text, /<[^>]+>/);
  assert.doesNotMatch(text, /access_token|refresh_token|secret/i);
});

test('email adapter reports delivery only after Resend confirms an email ID', async () => {
  const realFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url: String(url), options };
    return { ok: true, json: async () => ({ id: 'resend-email-1' }) };
  };
  try {
    assert.equal(await sendBudgetAlertEmail({
      current: 'warning',
      eventType: 'escalated',
      snapshot: { scopeLabel: 'user: demo', percentUsed: 72, limitAmount: 50, reservedAmount: 36, spentAmount: 0, currency: 'USD' },
    }, { eventId: 'event-1' }, env), true);
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.options.headers.authorization, 'Bearer re_test_key');
    const body = JSON.parse(request.options.body);
    assert.deepEqual(body.to, ['owner@example.test']);
    assert.match(body.subject, /Budget warning/);
    assert.match(body.text, /event-1/);
    assert.equal(Object.hasOwn(body, 'html'), false);
  } finally {
    global.fetch = realFetch;
  }
});

test('email adapter rejects unconfirmed provider delivery', async () => {
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: false, json: async () => ({ error: 'rejected' }) });
  try {
    await assert.rejects(() => sendBudgetAlertEmail({ current: 'critical', snapshot: {} }, {}, env), /did not confirm acceptance/);
  } finally {
    global.fetch = realFetch;
  }
});

test('budget alert worker stays disabled unless explicitly enabled and PostgreSQL-backed', () => {
  const previous = process.env.BOTFORGE_BUDGET_ALERT_WORKER;
  delete process.env.BOTFORGE_BUDGET_ALERT_WORKER;
  try { assert.equal(startWorker(), false); }
  finally {
    if (previous === undefined) delete process.env.BOTFORGE_BUDGET_ALERT_WORKER;
    else process.env.BOTFORGE_BUDGET_ALERT_WORKER = previous;
  }
});
