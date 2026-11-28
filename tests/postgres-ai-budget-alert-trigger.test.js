'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

test('budget scope writes automatically create and deduplicate alert transitions', {
  skip: !process.env.BOTFORGE_TEST_DATABASE_URL,
}, async () => {
  const client = new Client({ connectionString: process.env.BOTFORGE_TEST_DATABASE_URL });
  await client.connect();
  let scopeId;
  try {
    scopeId = (await client.query(`INSERT INTO ai_budget_scopes(scope_type,scope_key,currency,limit_amount,window_start,window_end)
      VALUES('global',$1,'USD',100,NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 hour') RETURNING id`,
    ['automatic-alert-trigger-' + Date.now()])).rows[0].id;

    const initial = await client.query('SELECT status FROM ai_budget_alert_state WHERE scope_id=$1', [scopeId]);
    assert.equal(initial.rows[0].status, 'normal');

    await client.query('UPDATE ai_budget_scopes SET reserved_amount=70 WHERE id=$1', [scopeId]);
    await client.query('UPDATE ai_budget_scopes SET spent_amount=15 WHERE id=$1', [scopeId]);
    await client.query('UPDATE ai_budget_scopes SET spent_amount=30 WHERE id=$1', [scopeId]);
    await client.query('UPDATE ai_budget_scopes SET spent_amount=20 WHERE id=$1', [scopeId]);
    await client.query('UPDATE ai_budget_scopes SET reserved_amount=0,spent_amount=0 WHERE id=$1', [scopeId]);
    await client.query('UPDATE ai_budget_scopes SET reserved_amount=reserved_amount WHERE id=$1', [scopeId]);

    const state = await client.query('SELECT status,snapshot FROM ai_budget_alert_state WHERE scope_id=$1', [scopeId]);
    assert.equal(state.rows[0].status, 'normal');
    assert.equal(state.rows[0].snapshot.percentUsed, 0);

    const events = await client.query('SELECT event_type,current_status FROM ai_budget_alert_events WHERE scope_id=$1 ORDER BY created_at,id', [scopeId]);
    assert.deepEqual(events.rows.map(row => [row.event_type, row.current_status]), [
      ['escalated', 'warning'],
      ['escalated', 'critical'],
      ['escalated', 'exhausted'],
      ['downgraded', 'critical'],
      ['recovered', 'normal'],
    ]);
    const outbox = await client.query('SELECT count(*)::int AS count FROM ai_budget_alert_outbox WHERE scope_id=$1', [scopeId]);
    assert.equal(outbox.rows[0].count, 5);
  } finally {
    if (scopeId) await client.query('DELETE FROM ai_budget_scopes WHERE id=$1', [scopeId]);
    await client.end();
  }
});
