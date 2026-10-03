# 09: Playback events

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** done
**Blocked by:** 07 (Stream and play a track)

## What to build

Every listen produces a durable, well-defined playback event, so History and Most played can be built now and Kafka and ClickHouse can be added in Phase 2 without touching the producers.

- Event envelope (immutable and versioned): event id, user id, track id, type (`play_started`, `play_completed`, `skipped`), timestamp, position in milliseconds and client identifier.
- A "play" counts at 30 seconds or 50% of the track, whichever comes first. This rule lives in one isolated, testable client module.
- Backend: an events endpoint that validates and accepts events idempotently (by event id), and an `EventPublisher` port whose Phase 1 adapter writes to a Postgres `play_event` table. The table and envelope are designed so a transactional-outbox relay can be added later.
- Contract: events endpoint authored in OpenAPI first; the envelope schema is documented.
- Endpoints (or queries) that later slices use: a user's recent plays and most-played tracks.

## Acceptance criteria

- [x] Playing a track for 30 seconds (or 50% for short tracks) produces exactly one qualifying play with all envelope fields populated.
- [x] Skipping before the threshold produces `skipped`, not a qualifying play.
- [x] Sending the same event id twice stores it once (API test).
- [x] Events from one user are never visible to another user.
- [x] The envelope carries a schema version field and an ADR documents the versioning and outbox plan for Phase 2.
- [x] Behavior-level tests cover the threshold rule and the emitted events using the MSW mock, and the API stores what it receives (Testcontainers with a real Postgres).

## Comments

- Done. Decisions, the envelope, versioning and the Phase 2 outbox plan are in ADR 0008.
- What was built: `play_event` table (migration V6, with a `seq` column for a later relay), `EventPublisher` port with a Postgres adapter, `POST /api/v1/events/playback` (idempotent by event id, 409 if the id belongs to someone else, the user always comes from the session), `GET /api/v1/history` and `GET /api/v1/history/most-played` (both per user, both count only `play_completed`). Contract first: operations and schemas in `contract/openapi.yaml`, web types regenerated.
- Client: `web/src/events/listens.ts` holds the 30 seconds or 50% rule and turns player states into events; `reporter.ts` wraps them in the envelope and sends them from a small localStorage outbox with retries; `PlaybackEvents.tsx` wires it up inside the app shell. The player state gained a `listen` counter so a repeat-one loop or a reload counts as a fresh listen.
- Interpretation to be aware of: `play_completed` is the qualifying play (sent once at the threshold), as the ticket words it, not "played to the end". The rule counts time actually heard, so seeking to the middle does not earn a play.
- Tests: 9 backend tests against real Postgres (stored fields, same id twice stored once, another user's id is a 409, user comes from the session, validation, 401s, history and most played are per user, limit); 24 web tests (the rule, the tracker driven by a real player with a fake audio element, and the reporter against the MSW mock, including retry with the same event id, a reload, and sign-out). Mutation checks on the seek filter, the 50% rule and skip emission all made tests fail.
- Not done: no History or Most played screens (they belong to later tickets and can use the two endpoints above). Events for the current track are not flushed when the tab is closed (see ADR 0008).
