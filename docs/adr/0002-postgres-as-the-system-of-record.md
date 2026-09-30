# 2. Postgres is the system of record

Status: accepted

## Context

OSSM needs relational data (users, library, playlists, play events), sessions, search and a simple job queue, on a single self-hosted box.

## Decision

Postgres holds all of it: Spring Data JPA plus native queries, Flyway migrations, Spring Session JDBC, full-text search with `pg_trgm`, and db-scheduler for ingest jobs behind an `IngestQueue` port. ClickHouse arrives in Phase 2 for analytics only.

## Consequences

One dependency to run and back up. Search and queueing may need to move out if the library grows far beyond a personal collection; the ports make that a contained change.
