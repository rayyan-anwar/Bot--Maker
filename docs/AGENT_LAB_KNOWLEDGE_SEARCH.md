# Agent Lab knowledge search

The allowlisted `knowledge.search` tool is enabled for approved runs. It requires an explicit bot ID and query; the bot must belong to the authenticated user. It retrieves only that bot's attached document chunks using the existing hybrid retrieval function (keyword fallback remains available). Results are capped to 8 and include source document/chunk identifiers and filenames for citation.

This is not public-web search. No cross-owner or public-bot knowledge retrieval is permitted through this tool. If embedding search is enabled but fails, retrieval falls back to keyword search. Per-run approval is still required.
