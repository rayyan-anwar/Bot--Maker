# Agent Lab dashboard

The authenticated dashboard now includes an Agent Lab panel:

- Create a plan from a goal (up to 4,000 characters).
- Load the signed-in user's latest plans.
- Review bounded plan steps and summaries.
- Approve a plan for review or cancel it.
- Display lifecycle status and explicit messaging that approval does not execute tools.

The UI uses DOM text APIs for model-generated plan content rather than interpolating model output into HTML. Plan generation remains subject to provider configuration, usage budget preflight and server-side rate limits.

This is a planning/review experience only. No autonomous tools, code execution, external actions or background workers are enabled by this interface.
