'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { transitionBudgetAlert } = require('../server/ai-budget-alert-lifecycle');

test('same status is deduplicated into no event', () => {
  assert.deepEqual(transitionBudgetAlert('warning', 'warning'), {
    changed: false, event: null, previous: 'warning', current: 'warning'
  });
});
test('normal to warning and critical are escalations', () => {
  assert.equal(transitionBudgetAlert('normal', 'warning').event, 'escalated');
  assert.equal(transitionBudgetAlert('warning', 'critical').event, 'escalated');
});
test('reaching exhausted is an escalation and normal is recovery', () => {
  assert.equal(transitionBudgetAlert('critical', 'exhausted').event, 'escalated');
  assert.equal(transitionBudgetAlert('critical', 'normal').event, 'recovered');
});
test('falling threshold emits downgrade', () => {
  assert.equal(transitionBudgetAlert('critical', 'warning').event, 'downgraded');
});
test('unknown is explicit and later evaluation resumes', () => {
  assert.equal(transitionBudgetAlert('warning', 'unknown').event, 'evaluation_unavailable');
  assert.equal(transitionBudgetAlert('unknown', 'critical').event, 'threshold_reached');
});
test('invalid status normalizes to unknown and never invents escalation', () => {
  const result = transitionBudgetAlert('nonsense', 'also-nonsense');
  assert.equal(result.current, 'unknown');
  assert.equal(result.event, null);
});
