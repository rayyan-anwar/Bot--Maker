# Fortisni session context

Fortisni browser sessions now retain a small, bounded recent-turn trace for UI continuity.

- Keeps only the latest four state/source labels (not message text).
- Snapshot returns current state, neutral-turn count and a copied recent trace.
- Reset clears state, neutral-turn count and recent trace.
- The session remains in-memory and is not persisted across reloads.
- The trace is intended for expressive UI continuity only, not sensitive profiling.

No user messages are stored by this context feature.
