/**
 * AI Engineer runner job/result contract.
 *
 * This is a pure validation module only: it does not launch workers, verify
 * cryptographic signatures, or establish that a result is trusted. Those checks
 * must be performed by the runner service before integrating this contract.
 */
const JOB_STATES = new Set(['queued', 'running', 'passed', 'failed', 'timed_out', 'cancelled', 'rejected']);
const PROFILE_IDS = new Set(['javascript-static', 'json-static']);

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
  if (!Number.isFinite(job.issuedAt) || !Number.isFinite(job.expiresAt)) errors.push('timestamps must be numeric');
  if (Number.isFinite(job.issuedAt) && job.issuedAt > now + 60_000) errors.push('issuedAt is in the future');
  if (Number.isFinite(job.expiresAt) && job.expiresAt <= now) errors.push('job is expired');
  if (Number.isFinite(job.issuedAt) && Number.isFinite(job.expiresAt) && job.expiresAt <= job.issuedAt) errors.push('expiry must follow issuance');
  if (!isString(job.repositoryId, 128)) errors.push('repositoryId is required');
  if (!isSha256(job.baseSha)) errors.push('baseSha must be a SHA-256 digest');
  if (!isSha256(job.patchSha256)) errors.push('patchSha256 must be a SHA-256 digest');
  if (!isString(job.path, 1024)) errors.push('path is required');
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
  if (!Number.isFinite(result.completedAt)) errors.push('completedAt must be numeric');
  if (!Number.isFinite(result.elapsedMs) || result.elapsedMs < 0) errors.push('elapsedMs must be non-negative');
  if (!Number.isSafeInteger(result.exitCode) || result.exitCode < -1 || result.exitCode > 255) errors.push('exitCode is invalid');
  if (!isString(result.workerImageDigest, 256)) errors.push('worker image digest is required');
  if (typeof result.signature !== 'string' || result.signature.length < 16 || result.signature.length > 4096) errors.push('signature field is required (cryptographic verification is external)');
  if (typeof result.diagnostics !== 'string' || result.diagnostics.length > (job.maxOutputBytes || 64 * 1024)) errors.push('diagnostics exceed output limit');
  return { valid: errors.length === 0, errors, trusted: false };
}

module.exports = { JOB_STATES, PROFILE_IDS, validateJobEnvelope, validateRunnerResult };
