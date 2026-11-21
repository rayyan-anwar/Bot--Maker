# Agent Lab knowledge search

The allowlisted `knowledge.search` tool is enabled for approved Agent Lab runs. It requires an explicit bot ID and query; the bot must belong to the authenticated user. It retrieves only that bot's attached document chunks using the existing hybrid retrieval function (keyword fallback remains available). Results are capped at 8 and include document/chunk identifiers and source filenames for citation.

This is not public-web search. No cross-owner or public-bot knowledge retrieval is permitted through this tool. Embedding/provider errors are surfaced rather than claiming semantic retrieval succeeded. Per-run approval is still required.
