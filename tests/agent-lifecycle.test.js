'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botforge-agent-lifecycle-'));
process.env.BOTFORGE_DATA_FILE = path.join(tempDir, 'db.json');
delete process.env.DATABASE_URL;
const store = require('../server/store');

const runId = '123e4567-e89b-42d3-a456-426614174000';

test('Agent Lab status transitions are owner-scoped and state-checked', async () => {
  await store.initialize();
  await store.insertAsync('aiEngineerRuns', {
    id: runId, kind: 'agent-plan', userId: 'owner-1', status: 'planned',
    plan: { title: 'Plan', steps: [] },
  });

  const wrongOwner = await store.transitionAgentRunStatus(runId, 'owner-2', ['planned'], 'approved');
  assert.equal(wrongOwner.state, 'not_found');

  const approved = await store.transitionAgentRunStatus(runId, 'owner-1', ['planned'], 'approved', { approvedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(approved.state, 'updated');
  assert.equal(approved.run.status, 'approved');

  const duplicateApproval = await store.transitionAgentRunStatus(runId, 'owner-1', ['planned'], 'approved');
  assert.equal(duplicateApproval.state, 'conflict');
  assert.equal(duplicateApproval.run.status, 'approved');

  const cancelled = await store.transitionAgentRunStatus(runId, 'owner-1', ['planned', 'approved'], 'cancelled');
  assert.equal(cancelled.state, 'updated');
  assert.equal(cancelled.run.status, 'cancelled');

  const reapproval = await store.transitionAgentRunStatus(runId, 'owner-1', ['planned'], 'approved');
  assert.equal(reapproval.state, 'conflict');
  assert.equal(reapproval.run.status, 'cancelled');
});

test('Agent Lab transition rejects invalid statuses and identifiers', async () => {
  assert.equal((await store.transitionAgentRunStatus('not-a-uuid', 'owner-1', ['planned'], 'approved')).state, 'invalid');
  assert.equal((await store.transitionAgentRunStatus(runId, 'owner-1', ['planned'], 'running')).state, 'invalid');
});
