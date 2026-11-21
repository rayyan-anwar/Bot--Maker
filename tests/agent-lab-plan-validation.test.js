'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePlan, MAX_GOAL_CHARS, MAX_STEPS, ALLOWED_STEP_TYPES } = require('../server/agents');

function validPlan() {
  return { title: 'Bounded plan', summary: 'Safe summary', steps: [{ type: 'research', title: 'Gather evidence', description: 'Find and record relevant evidence.' }] };
}

test('parsePlan rejects non-JSON root arrays and null', () => {
  assert.throws(() => parsePlan('[]'), /outside the supported format/);
  assert.throws(() => parsePlan('null'), /outside the supported format/);
});

test('parsePlan trims valid text fields and normalizes step ordering', () => {
  const plan = validPlan();
  plan.title = '  Bounded plan  ';
  plan.summary = '  Safe summary  ';
  plan.steps[0].title = '  Gather evidence  ';
  plan.steps[0].description = '  Find and record relevant evidence.  ';
  const parsed = parsePlan(JSON.stringify(plan));
  assert.equal(parsed.title, 'Bounded plan');
  assert.equal(parsed.summary, 'Safe summary');
  assert.equal(parsed.steps[0].title, 'Gather evidence');
  assert.equal(parsed.steps[0].description, 'Find and record relevant evidence.');
  assert.equal(parsed.steps[0].order, 1);
});

test('parsePlan rejects boundary-overflow fields and unsupported step kinds', () => {
  const plan = validPlan();
  plan.title = 't'.repeat(121);
  assert.throws(() => parsePlan(JSON.stringify(plan)), /outside the supported format/);
  const invalidType = validPlan();
  invalidType.steps[0].type = 'shell';
  assert.throws(() => parsePlan(JSON.stringify(invalidType)), /invalid step/);
});

test('plan limits and allowed types remain explicit and bounded', () => {
  assert.equal(MAX_GOAL_CHARS, 4000);
  assert.equal(MAX_STEPS, 12);
  assert.deepEqual([...ALLOWED_STEP_TYPES].sort(), ['analyze','decide','draft','research','review']);
});
