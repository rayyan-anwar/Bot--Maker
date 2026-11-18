# Part 1: Core Product

This part upgrades the existing BotForge MVP without replacing its existing authentication, bot, chat, document, retrieval, or storage architecture.

## Implemented in this branch

### Bot Studio
- Bot creation now captures purpose, target audience, and an optional welcome message in addition to name, description, instructions, visibility, provider, and model.
- Bot settings can edit the same metadata.
- Welcome message is used for the initial empty conversation.
- Server-side validation bounds each new field.

### Version history and rollback
- Creating a bot records version 1.
- Every non-empty settings update creates a new immutable snapshot and increments the version.
- Owner-only APIs list versions and restore a selected version.
- Restore creates a new version; it does not erase newer history.
- Version records are stored through the existing JSON/PostgreSQL persistence abstraction and are removed when their bot is deleted.

### Streaming chat
- Anthropic, OpenAI Responses API, and Gemini streaming endpoints are supported by provider adapters.
- Authenticated chat requests using `Accept: text/event-stream` receive token events followed by a completion event containing the saved message, RAG citations, and usage summary.
- The existing JSON chat response remains available for non-streaming clients.
- The browser chat UI consumes the event stream and renders text as it arrives.
- Mock provider streaming is available only when its existing non-production opt-in is enabled.

### Knowledge-base management and RAG
- Owner UI shows document chunk counts and semantic indexing status.
- Owners can remove documents and request a semantic re-index when embeddings are configured.
- Keyword retrieval remains available without paid embedding credentials.
- Retrieved chunks retain document/chunk references and are shown in chat as source citations.
- Offline retrieval evaluation reports Recall@K and mean reciprocal rank for labelled test queries.
- Retrieved documents remain explicitly marked as untrusted reference material in the model context.

## Automated coverage added
- Bot version creation, listing, restore, and version response metadata.
- Offline retrieval metric behavior and invalid input.
- Anthropic streaming token delivery and usage extraction.
- Authenticated SSE chat route integration with the mock provider, including persisted message verification.
- Existing CI covers Node.js 18/20/22, PostgreSQL 16 integration, syntax/security checks, and Docker image build/smoke test.

## Explicit limitations
- Streaming is provider-token streaming, but no browser-level E2E run has yet verified the complete experience.
- Semantic search/re-index requires operator-configured OpenAI embedding credentials and incurs provider cost; keyword search is the zero-cost fallback.
- RAG evaluation is a framework and small deterministic test fixture, not a large production benchmark or proof of answer faithfulness.
- External provider credentials, live provider smoke tests, and production infrastructure are not included in this part.
