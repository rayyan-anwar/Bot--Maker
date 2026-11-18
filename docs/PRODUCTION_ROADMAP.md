# BotForge Production Roadmap

## Product direction

**BotForge**: a workspace to create, ground, test, publish and monitor AI assistants. Initial positioning should be a practical bot/agent builder for Indian small businesses, educators, creators and agencies, with a path to global self-serve SaaS.

Do not attempt to ship every advanced agent feature in the first release. Win first on reliable bot creation, useful knowledge bases, model choice, safe sharing and predictable costs.

## Target architecture

| Layer | MVP-to-production choice | Purpose |
|---|---|---|
| Web app | Next.js + TypeScript, responsive component system | App shell, builder, dashboard, chat and settings |
| API | Node.js/TypeScript modular API (or retain Express during migration) | Auth, bots, conversations, providers, usage, billing |
| Primary database | PostgreSQL | Users, workspaces, bots, versions, conversations, quotas, invoices |
| Retrieval | PostgreSQL + pgvector initially | Embeddings, metadata filters and vector similarity |
| Cache/queue | Redis + worker queue | Rate limits, quotas, async ingestion, retries and scheduled tasks |
| Object storage | S3-compatible private bucket | Original files and generated artifacts |
| AI gateway | Provider adapter interface | Anthropic, OpenAI, Google Gemini and OpenAI-compatible endpoints |
| Observability | OpenTelemetry-compatible traces + structured logs + metrics | Debugging, latency, usage and cost attribution |
| Delivery | Docker, CI checks, managed PostgreSQL, managed Redis, object storage | Repeatable deployment and recovery |

Avoid Kubernetes at MVP stage. Start with one web/API service and one worker process; split services only when measurable load or isolation needs justify it.

## Release phases and acceptance criteria

### Phase 0 — Stabilize the existing MVP
- Preserve current behavior and data format during migration planning.
- Add tests for authentication, bot ownership, public/private access, uploads and chat failures.
- Add schema validation, safe error responses, request limits, security headers and basic throttling.
- Add health/readiness endpoints, structured logs and environment validation.
- Add CI for tests, linting and dependency/security checks.

**Exit:** tests pass in CI; no known critical/high security issue remains unmitigated; rollback procedure documented.

### Phase 1 — Commercial foundation
- PostgreSQL schema and migrations; migrate JSON data with validation and a rollback snapshot.
- Workspaces and tenant ownership; role model (owner/admin/member) designed from the start.
- Provider registry with capability metadata (text, vision, tools, context window, streaming).
- Encrypted BYOK credentials; never return provider secrets to the browser.
- Usage ledger records provider, model, input/output tokens, estimated cost, request ID and user/workspace.
- Configurable Free/Plus/Pro plan engine with daily/session/model/tool quotas and admin controls.
- Audit log for security-sensitive and billing actions.

**Exit:** no JSON database in production; quotas and spend caps enforced server-side; per-tenant isolation tests pass.

### Phase 2 — Advanced bot builder
- Guided create flow: purpose, audience, tone, instructions, model, knowledge, tools, privacy and publish settings.
- Prompt templates, preview/test chat, version history and rollback.
- Bot configuration: temperature, output limit, welcome message, fallback response, guardrails and allowed tools.
- Draft/published versions; publish only after validation.
- Starter templates for customer support, FAQ, education, lead qualification and internal knowledge.

**Exit:** a new user can create, test and publish a useful bot without editing raw prompts.

### Phase 3 — Memory and production RAG
- Separate conversation memory from knowledge-base retrieval.
- User-controlled memory: inspect, edit, disable, delete and retention settings.
- Ingestion pipeline: virus/file-type checks, extraction, normalization, chunking, embeddings, indexing and retry.
- Support PDF, DOCX, TXT, Markdown, HTML and approved connectors in staged rollout.
- Retrieval: metadata filters, hybrid keyword/vector search, reranking, source citations and confidence/fallback behavior.
- Defend against prompt injection in retrieved content; treat retrieved text as untrusted data.
- Evaluation datasets for retrieval precision, answer faithfulness and refusal behavior.

**Exit:** sources are cited in grounded answers; users can manage memory; ingestion is asynchronous and observable.

### Phase 4 — Publishing and integrations
- Hosted bot page and embeddable widget with allowed-domain controls.
- API keys, webhook signing, rate limits and API usage analytics.
- Integrations chosen from validated customer demand: WhatsApp, website CMS, CRM, helpdesk and Slack/Teams.
- Tool execution with per-tool permissions, timeouts, approval gates and sandboxing.

**Exit:** customers can deploy the same bot to at least two channels with separate analytics and security boundaries.

### Phase 5 — Scale and enterprise readiness
- Multi-region strategy only after demand requires it.
- Horizontal API/worker scaling, caching, queue backpressure and provider circuit breakers.
- Backups, restore drills, disaster recovery targets and incident response.
- SSO, RBAC, audit logs, retention controls, data export/deletion and tenant-level keys.
- Independent penetration test and compliance roadmap based on actual customer procurement needs.

## Security baseline

- Password hashing with a modern work factor; login throttling and breached-password policy.
- Secure, HttpOnly, SameSite cookies; Origin/CSRF protection; session revocation.
- Validate every request with schemas and enforce body, file, text, token and concurrency limits.
- Store secrets in a managed secret store; encrypt BYOK keys with envelope encryption.
- Keep public bot metadata separate from private prompts and owner-only settings.
- Isolate tenants in every query; test cross-tenant access explicitly.
- Use upload malware scanning, MIME/signature validation and isolated parsers.
- Redact secrets and personal data from logs; set retention and deletion policies.
- Verify payment webhooks and make billing operations idempotent.

## Suggested metrics

Activation: signup-to-first-bot, first successful test, publish rate.  
Engagement: weekly active builders, conversations per published bot, returning creators.  
Quality: answer success, citation correctness, retrieval hit rate, user feedback.  
Reliability: API availability, p95 latency, provider error rate, ingestion backlog.  
Economics: provider cost per conversation, gross margin by plan, quota exhaustion, paid conversion, churn.

## Release discipline

Every release must have a migration plan, automated tests, a staging smoke test, backup confirmation, rollback path and release notes. No secrets, production customer data or API keys belong in Git.

## Implementation snapshot (upgrade branch)

Implemented as an initial foundation: provider adapter layer (Anthropic/OpenAI/Gemini), configurable default model IDs, basic daily quota and token usage ledger in the development store, manual user-managed bot memory, provider selection at bot creation, initial UI quota meter, upload bounds, and security middleware.

Delivered on the upgrade branch: PostgreSQL JSONB runtime repository wired through authentication, bot, document, chat, memory and usage routes; JSON remains the local development adapter; the JSON importer seeds runtime records transactionally; PostgreSQL quota reservations use advisory locks and committed expiring reservation rows; chat messages and usage events commit atomically; `/healthz` and database-aware `/readyz` probes are available. Still requiring live database verification: managed PostgreSQL connectivity, migration rehearsal, concurrency testing and rollback. Implemented since this snapshot: tenant-scoped repository queries, optional OpenAI embedding generation, hybrid semantic/keyword retrieval with keyword fallback, and retrieval unit tests. Still requiring live database verification: managed PostgreSQL connectivity, migration rehearsal, concurrency testing and rollback. Also implemented: user-opt-in automatic memory extraction with per-bot controls, configurable Free/Plus/Pro daily message quotas, email-allowlisted admin API endpoints to assign plans, and Stripe subscription checkout plus signed webhook handling. Stripe flows still need live credentials and end-to-end payment verification. Admin and customer billing pages are also implemented. Not yet implemented: workspaces/RBAC, integrations, production deployment/monitoring and tested backup/restore.
