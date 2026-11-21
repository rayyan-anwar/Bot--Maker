'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { initializePlanSteps, transitionPlanStep, cancelPlanSteps, getPlanProgress } = require('../server/agents');

test('plan initialization gives each step safe defaults without losing step metadata', () => {
  const initialized = initializePlanSteps([{ order: 1, title: 'Research', type: 'research', description: 'Find sources' }]);
  assert.equal(initialized[0].title, 'Research');
  assert.equal(initialized[0].status, 'pending');
  assert.equal(initialized[0].retryCount, 0);
  assert.equal(initialized[0].startedAt, null);
  assert.equal(initialized[0].completedAt, null);
  assert.equal(initialized[0].error, null);
});

test('progress calculation handles empty and mixed state arrays', () => {
  assert.deepEqual(getPlanProgress([]), { total: 0, completed: 0, failed: 0, running: 0, pending: 0, percent: 0 });
  const steps = [
    { status: 'completed' }, { status: 'failed' }, { status: 'running' }, { status: 'pending' }, { status: 'completed' },
  ];
  assert.deepEqual(getPlanProgress(steps), { total: 5, completed: 2, failed: 1, running: 1, pending: 1, percent: 40 });
});

test('step transitions record timestamps and keep retry counts bounded', () => {
  const initial = initializePlanSteps([{ title: 'One' }]);
  const running = transitionPlanStep(initial, 0, 'running', '2026-11-21T12:00:00.000Z');
  assert.equal(running[0].startedAt, '2026-11-21T12:00:00.000Z');
  const failed = transitionPlanStep(running, 0, 'failed', '2026-11-21T12:01:00.000Z');
  assert.equal(failed[0].completedAt, '2026-11-21T12:01:00.000Z');
  const retry = transitionPlanStep(failed, 0, 'pending', '2026-11-21T12:02:00.000Z');
  assert.equal(retry[0].retryCount, 1);
  assert.equal(retry[0].error, null);
});

test('cancellation marks unfinished steps and leaves completed work intact', () => {
  const steps = [{ status: 'completed', completedAt: 'prior' }, { status: 'pending' }, { status: 'running' }];
  const cancelled = cancelPlanSteps(steps, '2026-11-21T12:03:00.000Z');
  assert.equal(cancelled[0].status, 'completed');
  assert.equal(cancelled[1].status, 'cancelled');
  assert.equal(cancelled[2].status, 'cancelled');
  assert.equal(cancelled[2].completedAt, '2026-11-21T12:03:00.000Z');
});
