const test = require('node:test');
const assert = require('node:assert/strict');
const { validateJobEnvelope, validateRunnerResult, MAX_JOB_TTL_MS, isGitCommitSha } = require('../server/ai-engine-runner-contract');

const sha = 'a'.repeat(64);
function job(overrides = {}) {
  return {
    jobId: 'job-1', nonce: 'nonce-1', issuedAt: Date.now() - 1000, expiresAt: Date.now() + 60_000,
    repositoryId: 'repo-123', baseSha: 'a'.repeat(40), patchSha256: sha, path: 'server/example.js',
    profileId: 'javascript-static', profileVersion: '1', policyVersion: '1', maxOutputBytes: 4096,
    ...overrides
  };
}
function result(j, overrides = {}) {
  return {
    jobId: j.jobId, repositoryId: j.repositoryId, baseSha: j.baseSha, patchSha256: j.patchSha256,
    profileId: j.profileId, profileVersion: j.profileVersion, policyVersion: j.policyVersion,
    state: 'passed', completedAt: Date.now(), elapsedMs: 25, exitCode: 0,
    workerImageDigest: 'sha256:' + 'd'.repeat(64), diagnostics: '', signature: 'signature-placeholder-long',
    ...overrides
  };
}

test('accepts valid bounded job envelope', () => assert.equal(validateJobEnvelope(job()).valid, true));
test('rejects expired job', () => assert.equal(validateJobEnvelope(job({ expiresAt: Date.now() - 1 })).valid, false));
test('rejects unsupported validation profile', () => assert.equal(validateJobEnvelope(job({ profileId: 'arbitrary-shell' })).valid, false));
test('rejects oversized output budget', () => assert.equal(validateJobEnvelope(job({ maxOutputBytes: 1000000 })).valid, false));
test('accepts structurally valid result but explicitly marks it untrusted', () => {
  const j = job(); const checked = validateRunnerResult(result(j), j);
  assert.equal(checked.valid, true); assert.equal(checked.trusted, false);
});
test('rejects mismatched base SHA result binding', () => {
  const j = job(); assert.equal(validateRunnerResult(result(j, { baseSha: 'b'.repeat(64) }), j).valid, false);
});
test('rejects non-terminal result state', () => {
  const j = job(); assert.equal(validateRunnerResult(result(j, { state: 'running' }), j).valid, false);
});
test('rejects diagnostics output beyond job limit', () => {
  const j = job({ maxOutputBytes: 8 }); assert.equal(validateRunnerResult(result(j, { diagnostics: 'x'.repeat(9) }), j).valid, false);
});


test('accepts Git SHA-1 and SHA-256 base revisions but rejects malformed revisions', () => {
  assert.equal(isGitCommitSha('a'.repeat(40)), true);
  assert.equal(isGitCommitSha('b'.repeat(64)), true);
  assert.equal(isGitCommitSha('a'.repeat(39)), false);
  assert.equal(validateJobEnvelope(job({ baseSha: 'x'.repeat(40) })).valid, false);
});

test('rejects repository paths outside the AI Engineer allowlist', () => {
  for (const path of ['src/app.js', 'server/../secrets.js', 'server\\\\auth.js', 'server/app.ts']) {
    assert.equal(validateJobEnvelope(job({ path })).valid, false, path);
  }
});

test('job lifetime is bounded to fifteen minutes', () => {
  const issuedAt = Date.now() - 1000;
  assert.equal(validateJobEnvelope(job({ issuedAt, expiresAt: issuedAt + MAX_JOB_TTL_MS })).valid, true);
  assert.equal(validateJobEnvelope(job({ issuedAt, expiresAt: issuedAt + MAX_JOB_TTL_MS + 1 })).valid, false);
});

test('result timestamps, image digest and terminal exit codes are bound to the job', () => {
  const j = job();
  assert.equal(validateRunnerResult(result(j, { completedAt: j.expiresAt + 1 }), j).valid, false);
  assert.equal(validateRunnerResult(result(j, { workerImageDigest: 'sha256:mutable' }), j).valid, false);
  assert.equal(validateRunnerResult(result(j, { exitCode: 1 }), j).valid, false);
  assert.equal(validateRunnerResult(result(j, { state: 'failed', exitCode: 0 }), j).valid, false);
  assert.equal(validateRunnerResult(result(j, { state: 'failed', exitCode: 1 }), j).valid, true);
});

test('diagnostic output is bounded by UTF-8 bytes rather than JavaScript characters', () => {
  const j = job({ maxOutputBytes: 4 });
  assert.equal(validateRunnerResult(result(j, { diagnostics: 'ééé' }), j).valid, false);
});
