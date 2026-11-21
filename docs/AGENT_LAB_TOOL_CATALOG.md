# Agent Lab tool catalog and execution gate

The authenticated `GET /api/agents/tools` endpoint returns a bounded catalog of planned tools for the signed-in dashboard. The catalog is descriptive and does not imply execution capability.

Initial catalog:
- `knowledge.search`: read-only knowledge search (not implemented)
- `web.search`: external public search (not implemented)
- `bot.read`: read owned bot configuration (not implemented)
- `text.analyze`: analyze user-provided text (not implemented)
- `draft.create`: create a draft artifact (not implemented)

Every catalog entry requires explicit approval. The policy validator checks the allowlist, run status, per-run tool approval, write/external permissions, and a 4 KB argument limit. Unknown tools and tools not enabled by the registry are rejected.

This PR does not execute tools. All catalog entries remain disabled and the validator always reports `executable: false`. Before execution is enabled, tool implementations need server-side permission checks, user approval, bounded runtime, sandboxing where applicable, audit logging, cancellation, budget checks, and tests for isolation and concurrency.
