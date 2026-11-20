# Social Intelligence integration foundation

## Scope

BotForge Social Intelligence is an opt-in workspace for analytics and publishing through official platform APIs. It must never scrape private pages, bypass authentication, automate browser sessions to imitate users, or request a user's platform password.

## Implemented security foundation\n\nThe repository now includes persistent, one-time OAuth state records in the shared store, S256 PKCE verifier/challenge generation, authenticated platform and state-initiation endpoints, and AES-256-GCM token-envelope encryption helpers. The encryption key is supplied through `BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY` as a base64-encoded 32-byte secret. The API intentionally does not advertise live OAuth or publishing until provider callback, token exchange, persistent connection lifecycle and app approvals are completed.\n\n## Initial adapter contract

Each platform adapter must implement:
- `getAuthorizationUrl({ state, redirectUri, scopes })`
- `exchangeCode({ code, redirectUri })`
- `refreshAccessToken({ refreshToken })` when the platform supports refresh
- `getAccountProfile({ accessToken })`
- `getAccountInsights({ accessToken, accountId, range })`
- `listRecentContent({ accessToken, accountId, cursor })`
- `publishContent({ accessToken, accountId, payload })` only when the platform grants publishing permission

Adapters must declare supported capabilities and required scopes. Unsupported operations return a typed not-supported response; they must not silently fall back to scraping.

## Security requirements

1. OAuth state must be cryptographically random, short-lived, single-use and bound to the authenticated BotForge user.
2. Validate the exact redirect URI and platform issuer; use PKCE wherever supported.
3. Request least-privilege scopes and show the requested permissions before redirecting.
4. Encrypt access and refresh tokens with envelope encryption backed by a managed KMS or an explicitly configured encryption key. Never store tokens in plaintext, logs, browser local storage or analytics.
5. Keep tokens server-side. Never return token material from APIs.
6. Enforce account ownership on every read, refresh, disconnect, analytics and publishing operation.
7. Support immediate disconnect, token revocation where available, and deletion of stored token material.
8. Apply platform rate limits, bounded retries, pagination limits and per-account usage budgets.
9. Record consent, granted scopes, connection time, last successful sync and disconnect time without recording secrets.
10. Publishing must require an explicit user action, preview, destination account confirmation and platform capability check.

## Data model proposal

- `socialConnections`: id, userId, platform, platformAccountId, displayName, grantedScopes, encryptedTokenEnvelope, tokenExpiresAt, status, connectedAt, lastSyncedAt, disconnectedAt.
- `socialSyncJobs`: id, connectionId, operation, cursor, status, attemptCount, nextAttemptAt, lastErrorCode, createdAt, completedAt.
- `socialMetricsSnapshots`: id, connectionId, capturedAt, rangeStart, rangeEnd, metricsJson, sourceApiVersion.

Unique key: platform + platformAccountId + userId. All queries must include user ownership.

## Safe rollout order

1. Register one platform app and complete its developer review.
2. Implement OAuth state, PKCE and encrypted token storage.
3. Add account profile and read-only analytics.
4. Add sync queue, pagination, retry and rate-limit handling.
5. Add publishing only after platform approval and a separate confirmation flow.
6. Run consent, cross-account isolation, token rotation, revocation and deletion tests.

## Not yet live

No platform OAuth credentials, app review approvals, configured token encryption key/KMS, or customer-connected social accounts are assumed to exist in this repository environment. Encryption helpers exist, but production KMS-backed key rotation and a complete connection lifecycle remain unimplemented. The adapter contract is not a claim of live connectivity.
