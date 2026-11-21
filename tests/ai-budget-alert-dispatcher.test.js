'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { dispatchBudgetAlertOutbox } = require('../server/ai-budget-alert-dispatcher');

const id = '123e4567-e89b-42d3-a456-426614174000';

test('dispatcher requires an explicit delivery adapter', async () => {
  await assert.rejects(() => dispatchBudgetAlertOutbox(async () => ({ rows: [] })), TypeError);
});

test('dispatcher delivers claimed payloads and records confirmed acceptance', async () => {
  const calls = [];
  const query = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('botforge_claim')) return { rows: [{ id, event_id: 'event-1', attempts: 1, payload: { eventType: 'critical' } }] };
    return { rows: [{ result: { updated: true, state: 'delivered' } }] };
  };
  const delivered = [];
  const result = await dispatchBudgetAlertOutbox(query, async (payload, context) => {
    delivered.push({ payload, context });
    return true;
  });
  assert.deepEqual(result, { claimed: 1, delivered: 1, retried: 0, failed: 0, ignored: 0, errors: [] });
  assert.equal(delivered[0].payload.eventType, 'critical');
  assert.equal(delivered[0].context.outboxId, id);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].values, [id, true, null, 60, 5]);
});

test('dispatcher records adapter failures as retryable outcomes and bounds error text', async () => {
  let finishValues;
  const query = async (sql, values) => {
    if (sql.includes('botforge_claim')) return { rows: [{ id, event_id: 'event-2', attempts: 2, payload: { eventType: 'warning' } }] };
    finishValues = values;
    return { rows: [{ result: { updated: true, state: 'pending' } }] };
  };
  const result = await dispatchBudgetAlertOutbox(query, async () => { throw new Error('provider offline'); });
  assert.equal(result.retried, 1);
  assert.equal(finishValues[1], false);
  assert.equal(finishValues[2], 'provider offline');
});

test('dispatcher never treats an unconfirmed delivery as success', async () => {
  let finishValues;
  const query = async (sql, values) => {
    if (sql.includes('botforge_claim')) return { rows: [{ id, event_id: 'event-3', attempts: 1, payload: {} }] };
    finishValues = values;
    return { rows: [{ result: { updated: true, state: 'pending' } }] };
  };
  await dispatchBudgetAlertOutbox(query, async () => ({ ok: true }));
  assert.equal(finishValues[1], false);
  assert.match(finishValues[2], /did not confirm acceptance/);
});

test('dispatcher reports completion persistence failures without claiming delivery', async () => {
  let calls = 0;
  const query = async (sql) => {
    calls += 1;
    if (sql.includes('botforge_claim')) return { rows: [{ id, event_id: 'event-4', attempts: 1, payload: {} }] };
    throw new Error('database unavailable');
  };
  await assert.rejects(() => dispatchBudgetAlertOutbox(query, async () => true), /database unavailable/);
  assert.equal(calls, 2);
});
