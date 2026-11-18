# BotForge UI/UX Specification

## Brand

**Name:** BotForge  
**Tagline:** Build. Train. Deploy. Your AI.  
**Voice:** confident, practical, clear. Avoid technical jargon in first-run experiences.

## Visual direction

- Dark mode: deep graphite surfaces, restrained violet/teal accent, high-contrast text.
- Light mode: warm off-white canvas, white cards, slate text and the same accent.
- Use a consistent 8px spacing scale, 12–16px card radii, clear typography hierarchy and restrained shadows.
- Motion: short 140–220ms transitions for hover, tabs, drawers and cards. Respect `prefers-reduced-motion`.
- Responsive: mobile-first layouts; builder controls become stacked panels; chat input remains reachable; tables become cards or horizontally scrollable.
- Accessibility: semantic landmarks, keyboard focus, labelled inputs, sufficient contrast, no color-only status indicators.

## Primary navigation

1. Overview
2. My bots
3. Knowledge
4. Analytics
5. Integrations
6. Settings and billing

## Core screens

### Overview dashboard
- Greeting and workspace switcher.
- Usage this period, remaining quota and next reset.
- Bot count, conversations, answer feedback and estimated spend.
- Recent activity and clear "Create bot" action.

### Bot creation wizard
1. Choose a template or start blank.
2. Name, purpose and audience.
3. Instructions and tone, with AI-assisted draft as an optional action.
4. Choose provider/model (show capability, latency/cost tier and BYOK status).
5. Add knowledge sources.
6. Set privacy, allowed domains and usage guardrails.
7. Preview, test and publish.

### Bot studio
- Left: bot settings and navigation.
- Center: live chat preview.
- Right: selected model, knowledge sources and advanced settings.
- Save draft and publish actions must be visually distinct.
- Version history and rollback are available from settings.

### Knowledge
- Upload/connect sources, processing state, indexing errors and chunk count.
- Test retrieval with a sample question.
- Show cited source passages and allow remove/re-index.
- Warn when a source is stale or failed.

### Analytics
- Conversations, active users, feedback, unanswered questions, provider/model usage, tokens, estimated spend and latency.
- Filter by date, bot, model and channel.
- Explain that cost estimates may differ from provider invoices.

### Chat experience
- Streaming response, stop generation, retry, copy, feedback and citations.
- Clear loading, empty, error, quota reached and provider unavailable states.
- Display model identity where relevant and disclose when the platform uses a managed model.
- Never show API keys or internal prompt secrets.

## Interaction rules

- Default all new bots to private.
- Confirm destructive actions and explain what data is deleted.
- Preserve unsent chat text when a provider request fails.
- Show remaining quota before a user hits a hard limit.
- Do not silently switch a user to a more expensive model.
- Keep theme preference across sessions and support system preference.
