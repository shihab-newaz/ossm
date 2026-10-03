# 5. Direct-to-store uploads through the proxy, and a Postgres-backed job queue

Status: accepted

## Context

Audio files are up to 250 MB. They should not pass through the API, and ingest (reading tags, extracting cover art) must survive restarts. The spike (ADR 0001) showed presigned multipart upload works on SeaweedFS; it left open how a browser reaches the store.

## Decision

- The API issues presigned part URLs and completes the multipart upload. The browser PUTs parts straight to the store. The API never receives file bytes, and the 250 MB cap is also enforced after completion, because a presigned URL cannot limit size.
- URLs are signed for the public address (`OSSM_PUBLIC_URL`) and Caddy routes `/ossm/*` (the bucket name) to the store on that same origin, passing the Host header and path through unchanged so the signature still verifies. No CORS is needed, and the store has no published port. An unsigned request is refused by the store (403). In `pnpm dev` without the proxy uploads do not work; use the compose stack.
- Ingest runs on db-scheduler through an `IngestQueue` port. The core library is used directly rather than its Spring Boot starter, because the starter targets Boot 3 and Boot 4 reorganised the auto-configurations it relies on. Jobs live in `scheduled_tasks` (Flyway-owned). A job queued before a restart runs afterwards, and a job abandoned by a crashed worker is picked up again after missed heartbeats (both covered by a restart test).
- Tags, duration and cover art are read on the JVM with jaudiotagger. It is old (last release 2021) but is the one JVM library that reads all five formats and their covers; it sits behind `TagReader`, so it can be replaced.
- An unreadable file is a terminal failure with a readable reason. Anything unexpected (store down, database error) throws, and the scheduler retries after 30 seconds. Retry policy and manual retry are ticket 06.

## Consequences

The bucket name is a reserved path on the site's origin. Audio objects are stored under `audio/<upload-id>.<ext>`; ticket 06 moves them to the content-addressed `audio/<aa>/<sha256>.<ext>` layout when it adds deduplication.
