# 9. Hindsight

Everything above records what was done and why it was done then. This page is different: it is a judgement made after the backend existed. It comes from a structured review of the backend's pattern (three independent reviewers, one review round) and from reading the code. Treat it as opinion with evidence, not as a decision. Each item says whether it was **observed** (seen in the code or docs) or **inferred**.

## What the backend actually is

A feature-packaged modular monolith in a transaction-script style (observed). Packages: `auth`, `users`, `ingest`, `storage`, `library`, `events`, `health`, `web`. Controllers and services call `JdbcClient` and the S3 client directly. Only two ports exist, each with one implementation: `EventPublisher` and `IngestQueue`. JPA is used only in `users`.

That fits the project: one developer, one database, about 4,000 lines, and tests at one HTTP seam with real infrastructure.

## Two questions that came up

**Do we need microservices? No.** Nothing in the project asks for independent scaling or separate teams, the single HTTP seam would split into several, and Phase 2 (Kafka relay, ClickHouse consumers) reads the events table and does not force the API apart. If a second deployable is ever wanted, the ingest worker is the only credible candidate, and an `ossm.ingest.enabled` flag already exists.

**Is the repository pattern valid? Partly.** It is already used where it fits: `users` has a repository behind the `Accounts` service, because a user is an aggregate with invariants. It does not fit `library`, whose reads are joined, aggregated projections (track with artist, album and uploader; album with counts), not aggregates. Use named query classes there. Keep repository-style load/save for aggregates that enforce rules on write, such as a playlist (ticket 14). A repository interface in front of `JdbcClient` would have one implementation that no test substitutes.

## The finding with the most weight

The shared track projection is trapped inside a controller (observed). The `Track` record and the `TRACK_COLUMNS` and `TRACK_JOINS` strings are package-private members of `LibraryController`, and `BrowseController` and `HistoryController` reach them by static reference. Search, favorites and playlists are separate modules in the spec, and a new package cannot reach them without duplicating them or making them public.

Recommended shape (inferred, and the review agreed): a public query class per module that owns SQL and returns records, with controllers left to HTTP, validation and OpenAPI. Do it incrementally. Extract the track projection first, build new modules that way from the start, and move existing controllers only when a ticket touches them. Migrating all 19 SQL call sites at once is not justified until tickets 12 to 14 prove the need.

## If you rebuild it, change these

Before the library grows:

1. **Enforce module boundaries with a test.** The spec says "Spring Modulith-style", but nothing checks it (observed: no ArchUnit or Modulith dependency). An ArchUnit rule is a few lines.
2. **Write the decisions that are only implicit.** A modular monolith on purpose, query classes over repositories, JdbcClient over JPA.
3. **Look at where the contract is weakest.** The contract test compares operations, response codes and schema property names, but not types, formats or descriptions (observed). Response shapes also exist twice, in `openapi.yaml` and in the `@Schema` annotations on controller records. A schema-level check in CI would close the gap (inferred).

Before the outbox relay:

4. **Settle what happens to events when a track is deleted.** `play_event` has a foreign key to `track` (observed). Analytics wants immutable history, which points to keeping the id and dropping the key (inferred).
5. **Build the relay with a lag and test commit ordering.** See the caveat in rung 6.
6. **Make the worker role explicit** (`api`, `worker`, `all`) on top of `ossm.ingest.enabled`.

As the library grows (all inferred):

7. Offset paging with a `count(*)` per request is fine for a personal library; move to keyset paging if a list reaches tens of thousands of rows.
8. Check what happens to the objects of failed or abandoned uploads. A periodic reconciliation of bucket against database would catch orphans.
9. Audio bytes behind a track id never change, so `ETag` and `If-Range` are cheap wins, and `HEAD` should be checked.
10. Add metrics for ingest duration and failures, queue depth, and bytes streamed. Actuator is already in place.
11. Give each test class its own database cloned from a template, so the restart tests no longer need a separate JVM.

## Documentation drift to know about (observed)

- Spec 01 (line 122) and ADR 0002 say "Spring Data JPA (native queries where performance warrants)". In the code, `library`, `ingest` and `events` use `JdbcClient` only, and `users` uses JPA alongside `JdbcClient` (`Invites`). JPA appears nowhere else.
- ADR 0003 says the contract test compares operations and status codes rather than full schemas. The test also compares each schema's property and required-property names.
- ADR 0004 records that there is no login throttling yet.

## Known gaps carried from `PROGRESS.md`

Tracks without an album are not grouped as singles. An album's "Uploaded by" names only the first track's uploader. Closing the tab does not flush a pending `skipped`. A background tab may miss a qualifying play if progress updates arrive more than 2 seconds apart (a suspicion, not a confirmed bug).

## Exercises: build the next three yourself

Tickets 12 to 14 are ready and do not exist yet. They exercise exactly what this page is about.

1. **Search (12).** One endpoint over `pg_trgm` and full-text search, grouped results, a timing check on a few thousand tracks. First decide where the track projection lives.
2. **Favorites and history screens' API (13).** Per-user isolation, tested with two `Session` objects.
3. **Playlists (14).** Ownership and visibility, reorder as a transactional position rewrite, and delete-cascade. A good place to try a repository-style aggregate.

For each, write the ticket's criteria as failing tests first (rung 0), and note afterwards what was not done on purpose and what was not verified.
