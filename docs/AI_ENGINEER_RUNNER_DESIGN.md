# AI Engineer ephemeral patch-validation runner design

**Status:** Design proposal only. No runner service or hosted infrastructure is deployed by this document.

## 1. Goal and non-goals

Add a pre-publication validation boundary for AI Engineer proposals. A proposed patch must be tested in a disposable environment before BotForge creates a draft pull request.

The runner must not:
- merge, deploy, publish releases, or modify the production application;
- receive provider API keys, GitHub write tokens, database credentials, session secrets, or production environment variables;
- access the production database, Docker socket, host filesystem, cloud metadata service, or other tenant workspaces;
- execute arbitrary commands supplied by a task, model response, repository file, or pull request comment.

The existing human-confirmed, proposal-only and draft-PR-only workflow remains mandatory.

## 2. Trust boundaries and request flow

1. The authenticated administrator requests a proposal through the existing AI Engineer route.
2. The application validates the repository, allowlisted path, base revision, patch size and one-time approval binding.
3. The application sends a minimal, signed job envelope to the runner API. The envelope contains a one-time job ID, source archive or patch reference, expected base SHA, allowed validation profile, and expiry. It contains no secrets.
4. The runner verifies the signature, expiry, replay status, archive limits and policy version before creating a fresh isolated worker.
5. The worker checks out or receives only the bounded source snapshot, applies the proposed patch, and executes the fixed validation profile.
6. The worker emits a bounded structured result and sanitized logs. The worker and writable storage are destroyed regardless of success, failure, timeout or cancellation.
7. The application verifies the result signature and job binding. A successful result permits the existing explicit admin confirmation flow to continue. Failure or missing/invalid result fails closed.
8. The existing approval claim and GitHub draft-PR workflow runs only after a fresh source-SHA check and explicit administrator confirmation.

## 3. Isolation architecture

Preferred production boundary: a dedicated runner control plane dispatching each job to a fresh, short-lived microVM or equivalent hardened single-use worker. A container inside the BotForge web process or a shared privileged Docker daemon is not an acceptable production boundary.

Minimum worker properties:
- one job per worker; no worker reuse between users or jobs;
- non-root execution, read-only base image and bounded writable scratch space;
- no host mounts, host PID/network namespaces, Docker/container runtime socket, or privileged capabilities;
- default-deny network egress; no access to private, loopback, link-local, metadata, database or control-plane address ranges;
- only explicitly approved dependency mirrors or package caches, if required by a validation profile;
- strict CPU, memory, process, file-descriptor, disk, output-size and wall-clock quotas;
- worker identity scoped to one job; short-lived mutual authentication between app and runner;
- forced destruction and cleanup on completion, failure, timeout, lease expiry or cancellation.

A conventional shared CI runner is not automatically equivalent to this boundary. Its host reuse, credentials, cache, network and runner lifecycle must be reviewed before use.

## 4. Fixed validation profiles

The request selects a named profile, never an arbitrary shell command.

Initial profiles:
- javascript-static: parse/check JavaScript using the repository's pinned Node runtime; no application execution.
- json-static: strict JSON parse and schema checks where a schema is defined.
- repository-tests: only after a separate security review, run the repository's pinned test command in the disposable worker with no secrets and no network by default.

Profile definitions are versioned and maintained by repository operators. The model cannot add commands, flags, environment variables, package scripts, mounts, network permissions or resource limits.

Do not automatically run package install scripts from untrusted proposed content. Dependencies must come from a prebuilt, digest-pinned image or a reviewed immutable cache. Any profile requiring dependency installation needs a separate threat review.

## 5. Job envelope and result contract

The signed request should include:
- jobId, issuedAt, expiresAt, nonce;
- repositoryId, baseSha, patchSha256, path;
- profileId, profileVersion, policyVersion;
- bounded resource limits and a maximum log/result byte count.

The signed result should include:
- the same jobId, repositoryId, baseSha, patchSha256, profile and policy versions;
- state (passed, failed, timed_out, cancelled, rejected);
- normalized exit status, elapsed time and resource usage;
- bounded sanitized diagnostics and a worker image digest;
- completion timestamp and runner signature.

Reject results with mismatched IDs or hashes, expired jobs, unknown policy/profile versions, oversized payloads, invalid signatures, duplicate completion or missing required fields. Never treat an absent result as success.

## 6. Failure and abuse handling

- Queue admission has per-admin and global concurrency limits.
- Each job has a hard deadline, bounded queue wait and one execution attempt. Retry policy must create a new job ID and nonce.
- Cancellation and lease expiry terminate the worker and revoke its job identity.
- Repeated invalid envelopes, signature failures, quota exhaustion and suspicious network attempts are recorded as redacted security events.
- Logs are treated as untrusted output; escape them in the admin UI and redact tokens/secrets before persistence.
- Do not persist source archives or generated patches beyond the configured short retention window. Store hashes and normalized results where possible.
- Runner/control-plane outage, timeout, policy mismatch or cleanup failure blocks draft PR creation.

## 7. Test and release gates

Before staging:
- unit tests for envelope signing, expiry, replay, schema validation and result verification;
- tests for archive traversal, symlinks, decompression bombs, oversized files, malformed patches and log flooding;
- tests proving no secrets or environment variables reach the worker;
- tests for network denial, metadata/private-IP denial, timeout, cancellation and forced cleanup;
- tests for duplicate delivery, worker crash, stale result and queue saturation;
- threat review of worker image build, signing-key custody, control-plane authentication and update process.

Before production:
- run the worker on dedicated disposable infrastructure, not the BotForge application host;
- verify isolation controls from inside and outside the worker;
- complete multi-tenant escape and network-egress testing;
- verify patch/base SHA binding and fresh source re-read immediately before draft PR creation;
- independent security review and documented incident/credential-rotation procedures.

## 8. Rollout sequence

1. Keep the current local Docker syntax adapter fail-closed and explicitly non-production.
2. Implement and test the signed job/result contract without enabling external execution.
3. Build a minimal runner control plane and disposable worker image in a separate staging environment.
4. Validate static-only profiles, lifecycle cleanup and network policy.
5. Integrate the application behind a disabled-by-default feature flag.
6. Complete adversarial and independent review before any production enablement.

No infrastructure provider, paid service, credentials or deployment is selected by this design. Cost and hosting choices require a separate decision after the security boundary is validated.
