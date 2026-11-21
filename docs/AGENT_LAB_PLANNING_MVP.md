# Agent Lab planning MVP

The authenticated `/api/agents` routes provide a first Agent Lab planning workflow.

- `POST /api/agents/plan` accepts a goal (1–4,000 characters), selects a configured supported provider, reserves and settles AI budget, validates structured JSON output, and stores a private plan.
- `GET /api/agents/mine` lists the signed-in user's latest 50 plans.
- `GET /api/agents/:runId` retrieves only a plan owned by the signed-in user.
- Plans are stored in the existing `aiEngineerRuns` collection with `kind: agent-plan`.
- Planner output is treated as untrusted. Only 1–12 steps using research, analyze, draft, review, or decide are accepted.
- The planner does not execute tools, run commands, access repositories, browse the web, or send external messages. A plan is a proposal, not proof that work was performed.
- Provider credentials are never accepted from request bodies. Only server-configured provider keys are used.
- Budget preflight is required through the existing AI usage subsystem.

This is the planning foundation, not the complete autonomous Agent execution engine. Tool registry, per-tool permissions, human approval gates, execution logs, cancellation and sandboxing remain separate future work.
