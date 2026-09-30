# 09: Playback events

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** ready-for-agent
**Blocked by:** 07 (Stream and play a track)

## What to build

Every listen produces a durable, well-defined playback event, so History and Most played can be built now and Kafka and ClickHouse can be added in Phase 2 without touching the producers.

- Event envelope (immutable and versioned): event id, user id, track id, type (`play_started`, `play_completed`, `skipped`), timestamp, position in milliseconds and client identifier.
- A "play" counts at 30 seconds or 50% of the track, whichever comes first. This rule lives in one isolated, testable client module.
- Backend: an events endpoint that validates and accepts events idempotently (by event id), and an `EventPublisher` port whose Phase 1 adapter writes to a Postgres `play_event` table. The table and envelope are designed so a transactional-outbox relay can be added later.
- Contract: events endpoint authored in OpenAPI first; the envelope schema is documented.
- Endpoints (or queries) that later slices use: a user's recent plays and most-played tracks.

## Acceptance criteria

- [ ] Playing a track for 30 seconds (or 50% for short tracks) produces exactly one qualifying play with all envelope fields populated.
- [ ] Skipping before the threshold produces `skipped`, not a qualifying play.
- [ ] Sending the same event id twice stores it once (API test).
- [ ] Events from one user are never visible to another user.
- [ ] The envelope carries a schema version field and an ADR documents the versioning and outbox plan for Phase 2.
- [ ] Behavior-level tests cover the threshold rule and the emitted events using the MSW mock, and the API stores what it receives (Testcontainers with a real Postgres).
