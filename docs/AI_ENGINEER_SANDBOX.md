# AI Engineer isolated patch validation

The AI Engineer must validate proposed JavaScript without executing the proposed program. JSON proposals use the built-in JSON parser. JavaScript proposals use `server/engineer-sandbox.js`, which invokes only `node --check` in a short-lived Docker container.

## Sandbox controls

- Network disabled (`--network=none`).
- Read-only root filesystem and read-only source mount.
- No Linux capabilities, no-new-privileges, non-root UID.
- 128 MiB memory, 0.5 CPU, 32 process limit, 64 file descriptors.
- 16 MiB no-exec temporary filesystem.
- 30 KB source limit and 10-second default validation timeout (maximum 15 seconds).
- No application environment variables, provider keys, GitHub tokens, or database credentials are passed to the container.
- The proposed JavaScript is syntax-checked only; it is never imported or executed.

## Runtime requirements and deployment warning

The validator requires a preloaded `node:22-alpine` image (or an immutable digest accepted by the validator) and a working Docker CLI/daemon. It uses `--pull=never`, so it will not download images during a request. A missing image or unavailable Docker daemon fails closed and prevents proposal approval or draft PR creation.

**Do not expose a production Docker socket to the BotForge web application.** Access to a Docker daemon is effectively host-level privilege. For any hosted deployment, run this validator behind a dedicated sandbox-worker service on a disposable, isolated worker host with no production secrets, no production database access, restricted outbound access, and a separately managed queue/API. The current local Docker adapter is a guarded implementation step, not proof of production-grade isolation or a production deployment recommendation.

Before enabling the feature in a controlled test environment:
1. Provision a disposable worker host and install Docker.
2. Preload and verify the approved Node image. Prefer setting `BOTFORGE_ENGINEER_SANDBOX_IMAGE` to an approved immutable image digest.
3. Ensure the BotForge process has access only to that worker's restricted Docker daemon, never a production host daemon.
4. Keep AI Engineer paused until the sandbox path has been tested end to end.
5. Confirm timeout cleanup, resource limits, network isolation, and absence of secrets from inside a test container.

The CI suite tests the Docker command policy and failure handling with a mocked process launcher. It does not certify a real daemon, kernel/container runtime, hosted worker, or production isolation boundary.
