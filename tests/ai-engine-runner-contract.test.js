const test = require('node:test');
const assert = require('node:assert/strict');
const { validateJobEnvelope, validateRunnerResult } = require('../server/ai-engine-runner-contract');

const sha = 'a'.repeat(64);
function job(overrides = {}) {
  return {
    jobId: 'job-1', nonce: 'nonce-1', issuedAt: Date.now() - 1000, expiresAt: Date.now() + 60_000,
    repositoryId: 'repo-123', baseSha: sha, patchSha256: sha, path: 'src/example.js',
    profileId: 'javascript-static', profileVersion: '1', policyVersion: '1', maxOutputBytes: 4096,
    ...overrides
  };
}
function result(j, overrides = {}) {
  return {
    jobId: j.jobId, repositoryId: j.repositoryId, baseSha: j.baseSha, patchSha256: j.patchSha256,
    profileId: j.profileId, profileVersion: j.profileVersion, policyVersion: j.policyVersion,
    state: 'passed', completedAt: Date.now(), elapsedMs: 25, exitCode: 0,
    workerImageDigest: 'sha256:verified-image', diagnostics: '', signature: 'signature-placeholder-long',
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
