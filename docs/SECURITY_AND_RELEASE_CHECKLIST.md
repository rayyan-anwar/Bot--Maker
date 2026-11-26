# BotForge Security and Release Checklist

This checklist is a launch gate. A checked item means evidence exists, not merely that someone intends to implement it.

## Identity and sessions
- [ ] Login/signup throttling and account lockout strategy tested.
- [ ] Password hashing parameters reviewed; async hashing used.
- [ ] Email verification and password reset implemented.
- [ ] Session revocation and rotation implemented.
- [ ] CSRF token or strict Origin validation for cookie-authenticated mutations.
- [ ] Secure, HttpOnly, SameSite cookies verified behind the production proxy.

## API and tenant isolation
- [ ] Schema validation on every write endpoint.
- [ ] JSON body and chat message limits enforced.
- [ ] Rate limits by IP, user, workspace and endpoint.
- [ ] Tenant-isolation tests cover every bot, document, message, usage and billing route.
- [ ] Public bot response does not disclose private prompts or owner settings.
- [ ] Idempotency keys on retryable/billing-sensitive operations.

## AI and data
- [ ] Server-side quota, token and spend ceilings enforced before provider call.
- [ ] Provider secrets encrypted and never sent to the client.
- [ ] Provider timeout, retry, circuit-breaker and safe error mapping.
- [ ] Prompt injection and tool execution threat model reviewed.
- [ ] RAG source citations, retrieval evaluations and untrusted-context handling tested.
- [ ] User memory can be inspected, disabled and deleted.
- [ ] Retention, export and deletion workflows tested.

## File ingestion
- [x] PDF signature, UTF-8, content/extension mismatch and control-character validation; ClamAV scanning fails closed in production; upload and extracted-text/page limits are enforced. ClamAV staging runtime still requires operator verification.
- [x] PDF parser runs in a resource-limited worker thread with timeout, page and extracted-text caps. OS/container-level parser sandboxing remains pending.
- [ ] Uploads stored privately; public URLs are short-lived if used.
- [x] Fortisni vision image uploads are scanned by ClamAV before provider handoff; scanner-unavailable behavior is fail-closed and covered by an authenticated endpoint regression test. Live daemon/signature readiness remains a staging check.
- [ ] Async ingestion, retries and dead-letter handling.
- [ ] File deletion removes source objects, extracted text and vector records.

## Operations
- [ ] CI tests, lint, dependency audit and secret scan pass.
- [ ] Staging smoke tests pass.
- [ ] Production database backups enabled and restore drill completed.
- [ ] Logs redact secrets and sensitive content.
- [ ] Metrics and alerts for errors, latency, provider spend and queue backlog.
- [ ] Rollback and incident response runbooks exist.
- [ ] Privacy policy, terms, refund policy and provider data disclosures reviewed by qualified counsel.
