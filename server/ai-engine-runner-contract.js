/**
 * AI Engineer runner job/result contract.
 *
 * This is a pure validation module only: it does not launch workers, verify
 * cryptographic signatures, or establish that a result is trusted. Those checks
 * must be performed by the runner service before integrating this contract.
 */
const JOB_STATES = new Set(['queued', 'running', 'passed', 'failed', 'timed_out', 'cancelled', 'rejected']);
const PROFILE_IDS = new Set(['javascript-static', 'json-static']);
const MAX_JOB_TTL_MS = 15 * 60 * 1000;
const { isAllowedEngineerPath } = require('./engineer-path');

function isString(value, max = 256) {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function validateJobEnvelope(job, now = Date.now()) {
  const errors = [];
  if (!job || typeof job !== 'object' || Array.isArray(job)) return { valid: false, errors: ['job must be an object'] };
  if (!isString(job.jobId, 128)) errors.push('jobId is required');
  if (!isString(job.nonce, 128)) errors.push('nonce is required');
  if (!Number.isFinite(job.issuedAt) || !Number.isFinite(job.expiresAt) || job.issuedAt <= 0) errors.push('timestamps must be positive numeric values');
  if (Number.isFinite(job.issuedAt) && job.issuedAt > now + 60_000) errors.push('issuedAt is in the future');
  if (Number.isFinite(job.expiresAt) && job.expiresAt <= now) errors.push('job is expired');
  if (Number.isFinite(job.issuedAt) && Number.isFinite(job.expiresAt) && job.expiresAt <= job.issuedAt) errors.push('expiry must follow issuance');
  if (!isString(job.repositoryId, 128)) errors.push('repositoryId is required');
  if (!isGitCommitSha(job.baseSha)) errors.push('baseSha must be a 40- or 64-character Git commit SHA');
  if (!isSha256(job.patchSha256)) errors.push('patchSha256 must be a SHA-256 digest');
  if (!isAllowedEngineerPath(job.path)) errors.push('path is outside the permitted repository paths');
  if (!PROFILE_IDS.has(job.profileId)) errors.push('profileId is not allowlisted');
  if (!isString(job.profileVersion, 64)) errors.push('profileVersion is required');
  if (!isString(job.policyVersion, 64)) errors.push('policyVersion is required');
  if (!Number.isSafeInteger(job.maxOutputBytes) || job.maxOutputBytes < 1 || job.maxOutputBytes > 64 * 1024) errors.push('maxOutputBytes is out of range');
  return { valid: errors.length === 0, errors };
}

function validateRunnerResult(result, job) {
  const errors = [];
  if (!result || typeof result !== 'object' || Array.isArray(result)) return { valid: false, errors: ['result must be an object'] };
  if (!job || typeof job !== 'object') return { valid: false, errors: ['job binding is required'] };
  for (const key of ['jobId', 'repositoryId', 'baseSha', 'patchSha256', 'profileId', 'profileVersion', 'policyVersion']) {
    if (result[key] !== job[key]) errors.push(key + ' does not match submitted job');
  }
  if (!JOB_STATES.has(result.state) || !['passed', 'failed', 'timed_out', 'cancelled', 'rejected'].includes(result.state)) errors.push('result state is invalid or non-terminal');
  if (!Number.isFinite(result.completedAt)) errors.push('completedAt must be numeric');\n  if (Number.isFinite(result.completedAt) && Number.isFinite(job.issuedAt) && result.completedAt < job.issuedAt) errors.push('result completed before job issuance');\n  if (Number.isFinite(result.completedAt) && Number.isFinite(job.expiresAt) && result.completedAt > job.expiresAt) errors.push('result completed after job expiry');
  if (!Number.isFinite(result.elapsedMs) || result.elapsedMs < 0) errors.push('elapsedMs must be non-negative');
  if (!Number.isSafeInteger(result.exitCode) || result.exitCode < -1 || result.exitCode > 255) errors.push('exitCode is invalid');
  if (typeof result.workerImageDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(result.workerImageDigest)) errors.push('worker image digest must be an immutable sha256 digest');
  if (typeof result.signature !== 'string' || result.signature.length < 16 || result.signature.length > 4096) errors.push('signature field is required (cryptographic verification is external)');
  if (typeof result.diagnostics !== 'string' || Buffer.byteLength(result.diagnostics, 'utf8') > (job.maxOutputBytes || 64 * 1024)) errors.push('diagnostics exceed output limit');\n  if (result.state === 'passed' && result.exitCode !== 0) errors.push('passed result must have exit code 0');\n  if (result.state === 'failed' && result.exitCode === 0) errors.push('failed result cannot have exit code 0');
  return { valid: errors.length === 0, errors, trusted: false };
}

module.exports = { JOB_STATES, PROFILE_IDS, MAX_JOB_TTL_MS, validateJobEnvelope, validateRunnerResult, isGitCommitSha };
