# Universal Social Intelligence & Automation

**Status:** Approved roadmap feature; implementation is deferred until the core BotForge work is ready.
**Product scope:** Social account connections, monitoring, analytics, content distribution, alerts, scheduling, and AI-assisted management.

## Vision

BotForge should let users connect their authorized social accounts and work across them from one dashboard or conversational AI agent. The module should be designed as a capability-based platform: each connector declares exactly what it can read, publish, monitor, and report.

## Planned capabilities

- **Unified dashboard:** Overview of connected accounts, audience growth, content performance, recent events, and connector health.
- **Follower/subscriber analytics:** New, lost, net growth, historical trends, and platform-specific metrics. Exact person-level identity is shown only when the platform officially provides it and the user is authorized to access it.
- **Activity monitoring:** New posts, videos, reels, and other public/authorized activity from the user's own accounts or selected watchlist accounts. Include observed timestamps, platform timestamps, and timezone where available.
- **Following/follower change history:** Track changes that can be observed through official APIs or user-authorized data. Do not promise universal identification of who unfollowed or who followed another account.
- **Content tracker:** Track a content item across platforms with statuses such as draft, queued, published, failed, unavailable, or not published. Store platform post IDs and links when returned. Distinguish confirmed publishing from inferred/unverified status.
- **Universal scheduler/publisher:** Compose, adapt, schedule, and publish content across connected platforms when official APIs and granted permissions support it.
- **Watchlists:** Monitor public activity and metrics for selected accounts, subject to each platform's policies, API limits, and availability.
- **Smart alerts:** Configurable instant, digest, milestone, anomaly, failed-publish, and new-content alerts.
- **AI Social Analyst / Fortisni:** Natural-language summaries, comparisons, recommendations, reports, and user-approved actions based on connected data.
- **Export/reporting:** Download analytics summaries and content activity history in supported formats.

## Platform strategy

Build the connector framework first. Add platform integrations in stages, starting with Instagram (authorized professional-account capabilities) and YouTube (channel-owner analytics and permitted public channel/video data), then expand to Facebook, X, TikTok, LinkedIn, Threads, Pinterest, Telegram, Reddit, Twitch, and other platforms as feasible.

Platform support is capability-based rather than a blanket promise. A connector should expose a capability matrix (for example: account profile, audience analytics, post analytics, publishing, comments, activity events, watchlist/public data) with states such as supported, limited, unavailable, permission required, or not yet implemented.

## Phased delivery

1. **Connector foundation:** OAuth/authorization where applicable, secure credential storage, token refresh/revocation, connector registry, permission scopes, rate-limit handling, sync jobs, webhook support, audit events, tenant isolation.
2. **First-party analytics:** Instagram and YouTube authorized account analytics; metric definitions, snapshots, time-series storage, and clear data freshness.
3. **Growth/event history:** Follower/subscriber changes and event history to the extent each platform exposes them. Avoid fabricating person-level change attribution.
4. **Activity monitoring and watchlists:** New content/activity monitoring, selected-account watchlists, content snapshots, notification rules.
5. **Content tracking:** Cross-platform content records, publish-state tracking, retries with idempotency, failed/pending/unconfirmed states, links and platform IDs.
6. **Scheduler and publishing:** Queue, timezone-aware schedule, per-platform adaptation, approval/preview, platform-specific publishing, retries and status tracking.
7. **AI Social Analyst:** Conversational reports, performance comparisons, trend/anomaly explanations, suggestions, and user-approved actions.
8. **Platform expansion:** Add connectors incrementally after capability, compliance, security, test, and cost reviews.

## Architecture direction

- Connector adapters with explicit capability declarations and normalized response schemas.
- OAuth tokens and secrets encrypted at rest; minimum scopes; reauthorization and disconnect controls.
- Multi-tenant data isolation for accounts, metrics, posts, watchlists, events, and schedules.
- Separate API sync, webhook processing, queue workers, and analytics aggregation.
- Immutable event/history records where practical; deduplicate events and publishing jobs.
- Respect platform API terms, permissions, quotas, retention rules, and user privacy.
- Clearly label platform-provided metrics, BotForge-observed events, estimates, and unavailable data.
- No scraping, login automation, access-control bypass, or private-data extraction as a workaround for unavailable official access.

## Proposed dashboard sections

- Social Overview
- Connected Accounts
- Audience Growth
- Activity & Following Changes
- Content Tracker
- Publishing Calendar
- Watchlist
- Alerts
- AI Social Analyst
- Connector Settings & Permissions

## Privacy, safety, and reliability

- User must authorize each account and scope; provide disconnect and data-deletion controls.
- Use least-privilege permissions and never ask users to provide social account passwords to BotForge.
- Securely store tokens; redact credentials from logs; audit publishing and account actions.
- Make write actions (publish, delete, reply, follow, unfollow, etc.) explicit and approval-gated initially. No autonomous destructive or engagement actions by default.
- Handle rate limits, revoked access, partial data, stale snapshots, webhook replay, and connector outages.
- Do not claim exact historical changes unless the platform provides them or BotForge has captured sufficient snapshots to calculate them.
- Explain limitations prominently where APIs do not provide follower identities, precise subscriber changes, stories, or other restricted data.

## Initial acceptance criteria

- A user can securely connect and disconnect supported accounts and review permissions.
- Each connector advertises its capabilities and limitations in the UI.
- Metrics display source, timestamp, timezone, and freshness where relevant.
- Growth calculations use stored snapshots and are transparent about coverage.
- Content statuses distinguish confirmed published, failed, queued, and unconfirmed.
- Alerts are configurable and deduplicated.
- Cross-account data isolation, credential handling, rate limits, and authorization are covered by automated tests.
- Publishing and other write operations require preview/confirmation in the initial release.
- Unsupported platform capabilities never appear as available actions.

## Product positioning

This module is a major planned BotForge capability, not a small add-on: **AI Bot Creation + Automation + Universal Social Intelligence**. It remains a roadmap item and must not delay the current core, security, reliability, and AI Engineer development sequence.
