const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

test('AI Engineer write endpoints enforce pause, explicit approval and patch boundaries before external calls', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botforge-engineer-guards-'));
  const keys = [
    'NODE_ENV', 'JWT_SECRET', 'BOTFORGE_ADMIN_EMAIL', 'BOTFORGE_SINGLE_ADMIN',
    'BOTFORGE_DATA_FILE', 'DATABASE_URL', 'BOTFORGE_GITHUB_TOKEN',
    'BOTFORGE_GITHUB_WRITE_TOKEN', 'BOTFORGE_GITHUB_REPO',
    'BOTFORGE_GITHUB_BRANCH', 'BOTFORGE_ENGINEER_PROVIDER', 'OPENAI_API_KEY'
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'engineer-guard-test-secret-with-at-least-thirty-two-characters';
  process.env.BOTFORGE_ADMIN_EMAIL = 'engineer-owner@example.test';
  process.env.BOTFORGE_SINGLE_ADMIN = 'false';
  process.env.BOTFORGE_DATA_FILE = path.join(dir, 'db.json');
  delete process.env.DATABASE_URL;
  delete process.env.BOTFORGE_GITHUB_TOKEN;
  delete process.env.BOTFORGE_GITHUB_WRITE_TOKEN;
  delete process.env.BOTFORGE_GITHUB_REPO;
  process.env.BOTFORGE_GITHUB_BRANCH = 'main';
  process.env.BOTFORGE_ENGINEER_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-placeholder-not-a-real-provider-key';

  const { start, shutdown } = require('../server/index');
  const server = await start(0, '127.0.0.1');
  const store = require('../server/store');
  const base = 'http://127.0.0.1:' + server.address().port;

  t.after(async () => {
    await shutdown();
    delete require.cache[require.resolve('../server/index')];
    delete require.cache[require.resolve('../server/store')];
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await store.insertAsync('users', {
    id: uuidv4(),
    email: 'engineer-owner@example.test',
    name: 'Engineer Test Owner',
    passwordHash: await bcrypt.hash('engineer-test-password-123', 4),
    sessionVersion: 0,
    failedLoginAttempts: 0,
    lockedAt: null,
    plan: 'pro',
    createdAt: new Date().toISOString()
  });

  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email: 'engineer-owner@example.test', password: 'engineer-test-password-123' })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.ok(cookie && cookie.includes('session='));
  const headers = { cookie, 'content-type': 'application/json', origin: base };

  const proposal = body => fetch(base + '/api/admin/engineer/propose-fix', {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  const createDraft = body => fetch(base + '/api/admin/engineer/create-draft-pr', {
    method: 'POST', headers, body: JSON.stringify(body)
  });

  const paused = await proposal({ path: 'server/auth.js', task: 'Review session validation' });
  assert.equal(paused.status, 423);

  const resume = await fetch(base + '/api/admin/engineer/control', {
    method: 'PUT', headers, body: JSON.stringify({ enabled: true })
  });
  assert.equal(resume.status, 200);

  process.env.BOTFORGE_GITHUB_TOKEN = 'read-token-placeholder';
  process.env.BOTFORGE_GITHUB_WRITE_TOKEN = 'write-token-placeholder';
  process.env.BOTFORGE_GITHUB_REPO = 'owner/repository';

  const invalidProposalPath = await proposal({ path: '../server/auth.js', task: 'Review session validation' });
  assert.equal(invalidProposalPath.status, 400);
  assert.match((await invalidProposalPath.json()).error, /normalized JavaScript and JSON paths/);

  const missingTask = await proposal({ path: 'server/auth.js', task: '' });
  assert.equal(missingTask.status, 400);

  const missingConfirmation = await createDraft({
    path: 'server/auth.js',
    task: 'Review session validation',
    proposedContent: 'module.exports = {};',
    baseSha: 'a'.repeat(40),
    approvalId: uuidv4(),
    confirm: false
  });
  assert.equal(missingConfirmation.status, 400);
  assert.match((await missingConfirmation.json()).error, /Explicit administrator confirmation/);

  const missingApproval = await createDraft({
    path: 'server/auth.js',
    task: 'Review session validation',
    proposedContent: 'module.exports = {};',
    baseSha: 'a'.repeat(40),
    confirm: true
  });
  assert.equal(missingApproval.status, 400);
  assert.match((await missingApproval.json()).error, /one-time approval ID/);

  const invalidApproval = await createDraft({
    path: 'server/auth.js',
    task: 'Review session validation',
    proposedContent: 'module.exports = {};',
    baseSha: 'a'.repeat(40),
    approvalId: 'not-a-valid-approval',
    confirm: true
  });
  assert.equal(invalidApproval.status, 400);

  const invalidDraftPath = await createDraft({
    path: 'server/../../secrets.js',
    task: 'Review session validation',
    proposedContent: 'module.exports = {};',
    baseSha: 'a'.repeat(40),
    approvalId: uuidv4(),
    confirm: true
  });
  assert.equal(invalidDraftPath.status, 400);

  const invalidSha = await createDraft({
    path: 'server/auth.js',
    task: 'Review session validation',
    proposedContent: 'module.exports = {};',
    baseSha: 'not-a-git-sha',
    approvalId: uuidv4(),
    confirm: true
  });
  assert.equal(invalidSha.status, 400);

  const oversized = await createDraft({
    path: 'server/auth.js',
    task: 'Review session validation',
    proposedContent: 'x'.repeat(30001),
    baseSha: 'a'.repeat(40),
    approvalId: uuidv4(),
    confirm: true
  });
  assert.equal(oversized.status, 400);
});
