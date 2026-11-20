# BotForge release acceptance matrix

This file is an evidence-based release gate. A feature is not complete merely because a route or UI exists.

| Area | Implemented foundation | Required evidence before launch |
|---|---|---|
| Bot Studio | Create/edit, settings, snapshots, restore validation, owner publish/unpublish | Full browser journey; malformed snapshot tests; publish access and embed checks |
| AI chat/providers | Provider adapters, streaming and usage reservations | Real provider smoke tests; timeout/retry and cost reconciliation |
| Knowledge Base | TXT/MD/PDF extraction, chunking, keyword/hybrid retrieval, embeddings | Malware scanner staging test; citation correctness evaluation; deletion verification |
| Fortisni | Emotion engine, session continuity, chat lifecycle and visual states | Browser accessibility and mobile visual QA; reduced-motion checks |
| AI Engineer | Admin gate, kill switch, audit, proposal validation, isolated draft PR workflow | Least-privilege GitHub token test; approval replay test; real Docker sandbox test; draft PR review |
| Social Intelligence | No live platform adapters assumed | OAuth app approval, PKCE/state, encrypted token storage, official API analytics and consent tests |
| Admin/operations | Diagnostics, security scan, metrics endpoint, budget controls | Alert routing, log redaction, budget emergency-stop rehearsal |
| Deployment | Docker/staging runbook, PostgreSQL runtime, health/readiness probes | Managed staging deployment, migration rehearsal, backups and restore drill, rollback test |

## Required release gates

- [ ] All CI workflows on the release commit pass.
- [ ] No unresolved critical/high security finding without an approved mitigation.
- [ ] Staging uses PostgreSQL, HTTPS, private uploads and a working malware scanner.
- [ ] Real provider smoke test succeeds with spend limits enabled.
- [ ] Cross-user and owner-only access tests pass for every sensitive route.
- [ ] Payment provider test-mode checkout, webhook signature and idempotency are verified.
- [ ] Backups are configured and a restore drill has succeeded.
- [ ] Error, latency, provider spend and ingestion failure alerts are tested.
- [ ] Privacy policy, terms, data retention and deletion procedures are reviewed.
- [ ] Rollback and incident response owners are identified.

## Current operational caveats

Repository commits and CI results do not prove a production deployment. Live hosting, provider credentials, payment credentials, social platform approvals, managed database access, malware scanner availability and backup infrastructure must be configured and tested separately.
