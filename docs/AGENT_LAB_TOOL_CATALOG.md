# Agent Lab tool catalog and controlled execution

Authenticated `GET /api/agents/tools` returns the tool catalog. Every run is user-owned and checked before tool requests.

## Implemented local tools
- `text.analyze`: bounded text statistics (characters, words, lines, sentence count, short preview). Maximum input 12,000 characters.
- `draft.create`: validates a title and content, returning a draft preview for user review. This does not save or publish the draft.
Both tools are disabled until a run is approved and each tool ID is explicitly approved on that run. Draft creation additionally requires explicit write permission.

## Not implemented
- `knowledge.search`
- `web.search`
- `bot.read`
These catalog entries are unavailable for execution.

## Dashboard controls
The dashboard lets users select local tools when approving a plan. Draft preview selection automatically requests explicit write permission. Approved runs show a tool picker, bounded JSON argument input, run button, and safely rendered JSON result. Web and other external tools are not selectable.

## Execution API
`POST /api/agents/:runId/approve` accepts optional `toolIds` (up to five known IDs), `writePermission`, and `externalPermission`. Omitting these values keeps approval plan-only. Requested write or external tools require their matching explicit permission. Approval is owner-only and only transitions a planned run.

`POST /api/agents/:runId/tools/:toolId` executes a registered tool only when the run is owned by the caller, approved, the tool is explicitly listed in `approvedToolIds`, permissions are present, and bounded arguments pass validation.

## Safety boundary
No shell, file system, network, arbitrary code, web browsing, or external action tool is implemented in this batch. Tools run synchronously in-process and are limited to bounded text processing. Draft results are preview-only, not persisted or published. Future tools need isolation, cancellation/timeouts, audit logs, abuse limits, budget checks, and concurrency tests before enabling external actions.
