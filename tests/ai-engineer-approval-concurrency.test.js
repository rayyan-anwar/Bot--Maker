const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

test('AI Engineer approval has one winner under concurrent claims and recovers an expired lease', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botforge-approval-race-'));
  const previousFile = process.env.BOTFORGE_DATA_FILE;
  const previousUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  process.env.BOTFORGE_DATA_FILE = path.join(dir, 'db.json');

  const storePath = require.resolve('../server/store');
  delete require.cache[storePath];
  const store = require('../server/store');

  t.after(async () => {
    await store.close();
    delete require.cache[storePath];
    if (previousFile === undefined) delete process.env.BOTFORGE_DATA_FILE;
    else process.env.BOTFORGE_DATA_FILE = previousFile;
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const id = crypto.randomUUID();
  const actorId = 'admin-concurrency-test';
  await store.insertAsync('aiEngineerApprovals', {
    id,
    actorId,
    repository: 'owner/repo',
    filePath: 'server/auth.js',
    baseSha: 'a'.repeat(40),
    contentHash: 'b'.repeat(64),
    taskHash: 'c'.repeat(64),
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    attempts: 0
  });

  const claims = await Promise.all([
    store.claimEngineerApproval(id, actorId),
    store.claimEngineerApproval(id, actorId)
  ]);
  assert.equal(claims.filter(result => result.state === 'claimed').length, 1);
  assert.equal(claims.filter(result => result.state === 'in_progress').length, 1);
  assert.equal((await store.findByIdAsync('aiEngineerApprovals', id)).attempts, 1);

  const wrongOwner = await store.claimEngineerApproval(id, 'different-admin');
  assert.equal(wrongOwner.state, 'invalid');

  // Simulate a worker crash after claiming: the lease expires, so a retry may recover.
  await store.updateEngineerApproval(id, actorId, {
    status: 'creating',
    leaseUntil: new Date(Date.now() - 1_000).toISOString()
  });
  const recovered = await store.claimEngineerApproval(id, actorId);
  assert.equal(recovered.state, 'claimed');
  assert.equal(recovered.approval.attempts, 2);

  await store.updateEngineerApproval(id, actorId, {
    status: 'created',
    leaseUntil: null,
    branch: 'botforge-ai-fix/' + id,
    pullRequestNumber: 73,
    url: 'https://github.com/owner/repo/pull/73'
  });
  const replay = await store.claimEngineerApproval(id, actorId);
  assert.equal(replay.state, 'created');
  assert.equal(replay.approval.pullRequestNumber, 73);
  assert.equal(replay.approval.url, 'https://github.com/owner/repo/pull/73');
  assert.equal((await store.claimEngineerApproval('not-a-uuid', actorId)).state, 'invalid');
});
