# BotForge Cross-Platform Application Strategy

Decision: One BotForge product and backend, with a shared web client and platform-specific shells. Preserve the existing Express API and static web client; do not fork business logic or rewrite the product per operating system.

## Target platforms

| Platform | Delivery | Packaging / distribution | Current status |
|---|---|---|---|
| Android | Installable PWA first; native shell later | Chrome/Android install; later Capacitor + Android App Bundle for Google Play | PWA foundation added; not device-tested |
| iOS / iPadOS | PWA first; native shell later | Safari Add to Home Screen; later Capacitor + Xcode archive for App Store | PWA foundation added; not device-tested |
| Windows | PWA install first; desktop app later | Edge/Chrome install; later Tauri 2 signed MSIX/installer | PWA foundation added; not packaged |
| macOS | PWA install first; desktop app later | Safari/Chrome install; later Tauri 2 signed and notarized DMG/PKG | PWA foundation added; not packaged |
| Linux | PWA install first; desktop app later | Chromium install; later Tauri 2 AppImage/deb/rpm | PWA foundation added; not packaged |

## Architecture

- Existing Express API remains the system of record for authentication, bots, chat, billing, usage, documents, social integrations and admin controls.
- Shared responsive web UI remains the primary client. All platform shells must call the same authenticated API and enforce the same server-side authorization and quotas.
- PWA is the first installable delivery path. Service worker caches only same-origin static assets. API responses, authentication, billing, workspace data, metrics and health endpoints are never cached.
- Offline mode is deliberately limited to a static offline notice. Do not queue bot edits, chat messages, payments or account actions offline until conflict resolution and secure synchronization are designed.
- Later, use Capacitor for Android/iOS native packaging and Tauri 2 for Windows/macOS/Linux desktop packaging. Reuse the web UI; add native plugins only for required capabilities (secure credential storage, share sheet, push notifications, file selection, deep links).
- Native apps must use HTTPS API endpoints, OS-protected secret storage, short-lived sessions, explicit permissions and secure deep links. Never embed provider secrets or server admin credentials in a client bundle.

## Release sequence

1. PWA foundation (current): manifest, scalable app icon, service worker, safe static caching, offline fallback, metadata on all current pages.
2. Responsive and install QA: Android Chrome, iOS Safari, Windows Edge/Chrome, macOS Safari/Chrome, Linux Chromium. Verify login, streaming, file uploads, theme, keyboard, touch, safe areas and install/update behavior.
3. Mobile shell: Capacitor Android and iOS projects, native permission declarations, secure storage, push/deep-link integration where justified, device testing and store compliance.
4. Desktop shell: Tauri 2 projects for Windows, macOS and Linux, signed/notarized builds, auto-update signing and platform-specific packaging.
5. Release operations: separate dev/staging/prod API environments, crash reporting with privacy controls, app version compatibility, staged rollout, rollback and support matrix.

## Important platform requirements

- Apple distribution requires macOS with Xcode for iOS build, signing and App Store submission. A cloud CI runner or Mac build host is needed if the developer has no Mac.
- Google Play requires a developer account, signing and store listing assets.
- Windows/macOS installers require code signing for trusted distribution; macOS distribution also requires Apple signing and notarization for normal Gatekeeper behavior.
- Linux package formats need a documented support matrix and tested target distributions.
- Browser/PWA support is not the same as a signed native store release.

## Security and privacy constraints

- Never cache /api/*, authentication/session endpoints, billing/webhooks, metrics, health/readiness or user-specific HTML.
- Do not store bearer tokens or provider API keys in localStorage or service-worker caches.
- Native secure storage must be backed by Android Keystore / iOS Keychain and equivalent OS facilities on desktop.
- File access, camera, microphone, notifications and background activity require explicit permission and platform review.
- Do not claim offline AI inference. Core bot execution requires a reachable backend/provider unless a separate local-model feature is designed.

## Completion gates

A platform is complete only after: build succeeds on its target OS; installation and upgrade work; authentication/session lifecycle is secure; core journeys pass; accessibility and responsive checks pass; signing/store requirements are met; crash/rollback procedures are documented; and a real device/OS test report is attached.

Current state: PWA source foundation is committed. No native Android, iOS, Windows, macOS or Linux package has been built or tested yet.
