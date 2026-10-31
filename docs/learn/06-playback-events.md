# 6. Playback events and the outbox

Ticket 09. ADR 0008. Migration V6.

## Goal

Every listen produces a durable, well-defined event, so History and Most played work now and a Kafka/ClickHouse pipeline can be added later without touching the code that produces events.

## Learn first

- Event envelope design: what is in an event, and why it is immutable and versioned.
- Idempotency keys: making a retry harmless.
- The transactional outbox pattern: why you write the event to the database you already trust and relay it afterwards, instead of writing to two systems.
- At-least-once delivery, and why consumers deduplicate.
- Ports and adapters at one seam, and why only one seam here.

## The envelope

| Field | Notes |
|---|---|
| `eventId` | UUID chosen by the client. The primary key, so it is the idempotency key. |
| `schemaVersion` | Integer, currently 1. The API accepts only versions it knows. |
| `userId` | Always from the session, never from the request body. |
| `trackId` | Foreign key to `track`. |
| `type` | `play_started`, `play_completed`, `skipped`. |
| `occurredAt` | Client clock, stored as sent. |
| `positionMs` | Playback position when it happened, not negative. |
| `clientId` | Random id per browser. |
| `receivedAt` | Server clock, set by the database. |

`play_completed` is the *qualifying play*: sent once, after 30 seconds or half the track has actually been heard. The name does not mean the track reached its end. The rule lives in one client module (`web/src/events/listens.ts`) because the client is what knows how long the user really listened.

## Procedure

1. **Define the envelope and the types** before any code. Write the ADR first; the rest follows from it.
2. **Contract first.** Author the endpoint and the request schema in `contract/openapi.yaml`.
3. **Schema (V6).** A `play_event` table: `event_id` primary key, a `seq` identity column that is unique and increasing, check constraints on `type` and `position_ms`, foreign keys to `users` and `track`, and `received_at` defaulting to `now()`. Add indexes for the two reads: a user's recent qualifying plays, and per-track counts for a user (a partial index on `play_completed`).
4. **The port.** `EventPublisher.publish(PlaybackEvent)` returns an outcome: `STORED`, `DUPLICATE` or `CLASH`. Producers only call this.
5. **The Postgres adapter.** One `insert ... on conflict (event_id) do nothing`. If zero rows were inserted, read the owner of that id: the same user means `DUPLICATE`, another user means `CLASH`.
6. **The endpoint.** `POST /api/v1/events/playback`. Validate the body (version range, type pattern, non-negative position, bounded client id). Build the event with the user from the session. Answer `202` for stored and duplicate, `409` for a clash, `404` when the track foreign key fails, `400` for anything invalid.
7. **Reads.** `GET /api/v1/history` and `GET /api/v1/history/most-played`, both per user, both counting only `play_completed`.

## Decisions and why (ADR 0008)

- **Rows are written once and never updated.** Anything that consumes them later can trust they do not change.
- **The table is the outbox.** The `seq` column lets a relay read in order and resume from the last `seq` it shipped. Because the write that stores an event is the same write that makes it available, there is no dual write to Postgres and Kafka.
- **The client retries from a localStorage outbox.** Retries use the same event id, which is why server-side idempotency matters.
- **`409` for someone else's event id.** The original stays untouched.

## A caveat to understand, not skip

Identity values are assigned at insert, not at commit. A transaction that commits late can become visible behind a cursor that has already moved past its `seq`. Single-row autocommit inserts make the window tiny but not zero. A relay should lag the head by a few seconds, or read by `received_at` with a safety margin, rather than trusting `seq` alone.

## Known limits (recorded)

- Leaving the page does not send the last `skipped`, because the browser may cancel the request. Unsent events stay in the outbox and go out on the next visit.
- Deleting a track later needs a decision: keep its events with the id (drop the foreign key) or remove them. It should not be a silent cascade.

## Checkpoint

- [ ] An event is stored with every envelope field populated, and `received_at` is set by the server.
- [ ] Sending the same event id twice stores one row and answers `202` both times.
- [ ] Sending an id that belongs to another user answers `409` and leaves the original intact.
- [ ] A user id in the request body is ignored; the session's user is stored.
- [ ] Unknown type, missing field, negative position and unsupported version are each rejected and nothing is stored.
- [ ] An anonymous caller is turned away.
- [ ] History lists only your own qualifying plays, newest first. Most played counts them per track. A `limit` is honoured and bounded.
- [ ] Break the idempotent insert on purpose and confirm a test fails.

## Reference code

`events/` (`EventPublisher`, `PostgresEventPublisher`, `PlaybackEvent`, `EventsController`), `library/HistoryController`, `V6__play_events.sql`. Test: `PlaybackEventsTest`.
