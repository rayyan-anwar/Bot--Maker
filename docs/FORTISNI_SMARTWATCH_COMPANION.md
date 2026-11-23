# Fortisni Smartwatch Companion and Visual Intelligence

## Product decision

Fortisni is the only primary BOTForge experience shown on a supported smartwatch. The watch is a companion surface, not a miniature BOTForge dashboard. The same Fortisni identity, conversation context, and user-selected personality should carry across web, desktop, phone, and watch.

This document records the product and technical scope. It does not claim that a smartwatch application or camera pipeline is already implemented.

## Target platforms

- Wear OS watches, subject to device capabilities and Play distribution requirements.
- Apple Watch (watchOS), paired with the iPhone companion application.
- A capability-adaptive experience is required. Do not assume every watch has a camera, speaker, microphone, or unrestricted background execution.

## Core watch experience

1. Animated Fortisni avatar with expressive states (listening, thinking, speaking, happy, concerned, and idle).
2. Short voice conversations using the watch microphone and speaker or connected audio route where supported.
3. Text input and concise text replies as an accessible fallback.
4. Conversation handoff between watch and paired phone without losing the active session.
5. User-approved reminders and selected notifications, with actionable quick replies where supported.
6. Haptic cues for meaningful events, respecting device and user settings.
7. Compact responses and quick actions designed for a small screen. Long analysis opens on the phone.

## Visual intelligence through the paired phone

Most mainstream smartwatches do not include a built-in camera. Fortisni must therefore support an explicit phone-camera handoff:

- The user starts a visual session from the watch or phone. The phone companion app requests camera permission and visibly indicates when the camera is active.
- The phone captures a still image or, where supported and explicitly selected, streams frames for a time-limited live visual session to the authorized Fortisni vision service.
- Fortisni can describe a scene, answer questions about visible objects, read text/documents, compare visible items, and explain what is in frame.
- The watch receives a concise spoken or text summary. Detailed results, annotated images, and follow-up controls are displayed on the phone.
- If the phone camera is unavailable, permission is denied, connectivity is lost, or live processing is unsupported, offer a clear fallback to a user-selected still photo or text conversation.
- A future camera-equipped watch may use its own camera only through a separately implemented, platform-approved capability adapter. It is not a prerequisite for the core experience.

## Privacy, safety, and controls

- Camera and microphone access must be permission-gated by the operating system and initiated by a clear user action.
- Show an unmistakable in-app active-camera/live-session indicator and a one-tap stop control.
- Never activate camera or microphone secretly, bypass OS indicators, or record continuously in the background.
- Do not retain raw images or video longer than required for the requested analysis. Retention, if any, must be disclosed and user-controlled.
- Encrypt data in transit; authorize phone-watch pairing and session tokens; revoke access when a device is unpaired.
- Provide controls for conversation history, visual-session history, and deletion according to BOTForge's account data policy.
- Treat faces, private documents, and sensitive surroundings cautiously. Do not identify people or infer sensitive traits from camera footage.

## Architecture direction

- Watch app: thin Fortisni UI, voice/text capture, haptics, notification actions, and session handoff.
- Phone companion: device pairing, camera/microphone permission flows, capture UI, connectivity relay, and OS-specific lifecycle handling.
- BOTForge services: authenticated conversation/session API, vision inference adapter, policy enforcement, and optional short-lived media handling.
- Shared conversation context: synchronize messages and session state through the authenticated account; do not rely on a permanently open watch connection.
- Capability adapters: expose platform capabilities (audio, camera handoff, haptics, notifications, connectivity) rather than assuming feature parity between watchOS and Wear OS.

## Delivery sequence

1. Define the shared Fortisni conversation/session contract and permission model.
2. Build phone-side visual capture and one-shot image analysis first.
3. Add time-limited live frame analysis only after latency, cost, privacy, and connectivity testing.
4. Build the Wear OS and watchOS companion shells with voice/text fallback.
5. Add cross-device session handoff, concise visual summaries, haptics, and notification actions.
6. Validate on real supported devices and publish a per-device capability matrix before claiming platform support.

## Acceptance criteria

- The watch opens directly into Fortisni, not the BOTForge dashboard.
- A user can start and stop a voice session and receive a response on supported hardware.
- A watch conversation can continue on the paired phone with context preserved.
- The user can explicitly launch the phone camera from a visual session, see a clear active indicator, ask a question, and receive a concise Fortisni answer on the watch.
- Denying camera permission or losing connectivity fails safely and leaves voice/text interaction usable.
- No camera or microphone capture occurs without explicit user initiation and platform permission.
- Tests cover pairing authorization, session expiry, camera permission denial, interrupted streams, media size limits, and cross-device context synchronization.

## Release status

Planned product scope only. Implementation, device testing, and release approval remain separate milestones.
