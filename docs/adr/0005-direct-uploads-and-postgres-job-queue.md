# 5. Direct-to-store uploads through the proxy, and a Postgres-backed job queue

Status: accepted

## Context

Audio files are up to 250 MB. They should not pass through the API, and ingest (reading tags, extracting cover art) must survive restarts. The spike (ADR 0001) showed presigned multipart upload works on SeaweedFS; it left open how a browser reaches the store.

## Decision

- The API issues presigned part URLs and completes the multipart upload. The browser PUTs parts straight to the store. The API never receives file bytes, and the 250 MB cap is also enforced after completion, because a presigned URL cannot limit size.
- URLs are signed for the public address (`OSSM_PUBLIC_URL`) and Caddy routes `/ossm/*` (the bucket name) to the store on that same origin, passing the Host header and path through unchanged so the signature still verifies. No CORS is needed, and the store has no published port. An unsigned request is refused by the store (403). In `pnpm dev` without the proxy uploads do not work; use the compose stack.
- Ingest runs on db-scheduler through an `IngestQueue` port. The core library is used directly rather than its Spring Boot starter, because the starter targets Boot 3 and Boot 4 reorganised the auto-configurations it relies on. Jobs live in `scheduled_tasks` (Flyway-owned). A job queued before a restart runs afterwards, and a job abandoned by a crashed worker is picked up again after missed heartbeats (both covered by a restart test).
- Tags, duration and cover art are read on the JVM with jaudiotagger. It is old (last release 2021) but reads MP3, FLAC, M4A, Ogg Vorbis and WAV with their covers; it sits behind `TagReader`, so it can be replaced. It cannot read Opus at all, so Opus-in-Ogg has a small in-house reader (`OpusReader`: the OpusHead and OpusTags packets plus the last page's granule position for duration).
- What a file is comes from its bytes, never its name (`AudioSniffer`): magic numbers for FLAC, Ogg (Vorbis or Opus), WAV and MP4 audio, and for MP3 two consistent frames in a row, because a single matching byte pair is common in binary data (a WebM file once passed for MP3 that way). An unsupported file is a terminal failure with a readable reason.
- Identical files are recognised by SHA-256 (computed while downloading, stored on the track, with a partial unique index). A second copy ends as `DUPLICATE` pointing at the existing track, and its object is deleted. The database guarantees this even if two copies are ingested at the same moment.
- Anything unexpected (store down, database error) throws, and the scheduler retries with exponential backoff (30 s doubling to a 30 min cap, five attempts). After that the upload becomes `FAILED` with a readable reason, and the user can retry from the upload screen. Admins see everyone's failures at `/api/v1/admin/ingest-failures`.
- The album's dominant colour is computed at ingest from the cover with the JDK's image decoder (saturated, bright colours outweigh grey, white and black) and stored with the album. A cover the JDK cannot decode (WebP) is kept and shown, but has no colour.

## Consequences

The bucket name is a reserved path on the site's origin. Audio objects stay under `audio/<upload-id>.<ext>`. The content-addressed layout from the spike (`audio/<aa>/<sha256>.<ext>`) was not needed: deduplication is done by the hash in Postgres, and copying 250 MB objects to rename them would only add a failure mode. Cover art is content-addressed (`covers/<aa>/<sha256>.<ext>`).

A track without an album tag has no album row, so it has no cover or colour. Browsing (ticket 10) should group such tracks as singles.
