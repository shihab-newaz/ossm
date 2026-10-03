# 8. Playback events: a versioned envelope in Postgres, ready for an outbox

Status: accepted

## Context

History and Most played are built from what people listen to, and Phase 2 wants the same stream of events in Kafka and ClickHouse. The events have to be well defined now, so that moving them later changes the plumbing and not the producers or the shape of the data.

## Decision

**The envelope.** Every event has: `eventId` (UUID, chosen by the client), `schemaVersion` (integer, currently 1), `userId`, `trackId`, `type`, `occurredAt` (client time), `positionMs` and `clientId` (a random id per browser, kept in localStorage). The server also records `receivedAt`. Rows are written once and never updated. The user is always taken from the session, never from the request body, so nobody can report a listen as someone else.

**Types, and what counts as a play.**
- `play_started`: the track began to sound.
- `play_completed`: the qualifying play. Sent once per listen, when the listener has actually heard 30 seconds or half the track, whichever comes first. The name is the spec's; it does not mean the track played to its end.
- `skipped`: the listener left a track that started but never reached that point (next, previous, jumping in the queue, signing out, or the track ending after being mostly jumped over).

The rule lives in one client module, `web/src/events/listens.ts`. It counts time spent listening, not position: seeking to the middle of a track does not earn a play, and time spent paused does not count. History and Most played count `play_completed` only.

**Versioning.** `schemaVersion` changes only when a field is added, removed or changes meaning. The API accepts only versions it knows and answers `400` to anything else, so an out-of-date client can never write rows a consumer would misread. When a new version exists, the API accepts both for as long as old clients are around, and consumers branch on the field. Adding a field in the same shape is a new version; the contract file documents the current one (`PlaybackEventRequest`).

**Idempotency.** `event_id` is the primary key and the insert is `ON CONFLICT DO NOTHING`. Sending the same event again answers `202` and stores nothing, which makes client retries safe. The same id arriving from a different user is a `409` and leaves the original untouched.

**Delivery from the client.** Events wait in a small outbox in localStorage until the server has accepted them, are retried every 15 seconds after a network error or a 5xx, and are dropped on any other answer (the server has given its verdict). The outbox is cleared on sign-out, so unsent events are never credited to the next person on that browser.

**The port.** Producers call `EventPublisher.publish(event)`. The Phase 1 adapter, `PostgresEventPublisher`, writes the `play_event` row. Nothing else knows where events go.

## Phase 2: the outbox

`play_event` already carries a `seq` identity column, unique and increasing, which a relay can read in order and resume from by remembering the last `seq` it shipped. Phase 2 adds a relay that reads rows past its cursor, publishes them to Kafka keyed by `userId`, and advances the cursor, giving at-least-once delivery. Consumers deduplicate on `eventId`, which they can because it is stable. Because the table is the outbox, no producer changes, and the write that stores an event is the same write that makes it available to the relay (no dual write to Postgres and Kafka).

A caveat: identity values are assigned at insert, not at commit, so a transaction that commits late can become visible behind a cursor that has moved past its `seq`. Single-row autocommit inserts, as written here, make that window tiny but not zero. The relay should therefore lag the head by a few seconds, or read by `received_at` with a safety margin, rather than trusting `seq` alone.

## Consequences

- A listener who leaves the page does not send a `skipped` or the final events for the current track, because the browser may cancel the request. Anything already in the outbox is kept and sent on the next visit. A qualifying play is sent the moment it is reached, so the case that matters for Most played is covered.
- Reloading mid-track and pressing play counts as a new listen of that track (its `play_started` records the position it resumed from).
- `occurredAt` is the client's clock. It is stored as sent. `receivedAt` is the server's.
- The `play_event` table has foreign keys to `users` and `track`. Deleting a track later will need a decision about its events (keep them with the id, or drop the foreign key) rather than a silent cascade.
