# 05: Upload, ingest and a track appears (MP3 happy path)

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** done
**Blocked by:** 03 (First-run setup, login and sessions), 02 (SeaweedFS spike)

## What to build

The core blob pipeline, end to end for the simplest case. A logged-in user drags an MP3 onto the upload screen, it uploads straight to the object store, an asynchronous ingest job processes it, and the track shows up in a basic library list with its tags and cover art.

- Contract: presigned multipart upload, upload-complete, and ingest-status endpoints authored in OpenAPI first.
- Backend: presigned multipart upload issued by the API; upload-complete enqueues an ingest job on the Postgres-backed scheduler behind an `IngestQueue` port; the job reads tags and technical properties on the JVM (no ffmpeg), extracts embedded cover art into the store, and writes normalized artist, album and track rows; job and file status are queryable. Access to the store uses only the vendor-neutral AWS SDK S3 client.
- Web: upload zone (drag and drop or pick multiple files), per-file progress, an "ingesting" state that updates until done, and a basic tracks list so the result is visible. Skeleton loaders, empty state guiding users to upload.
- Data model: artist, album and track tables with the normalized fields from spec 01.

## Acceptance criteria

- [x] A logged-in user uploads an MP3 and, after ingest, sees the track with correct title, artist, album, duration and cover art.
- [x] Uploads go directly from the browser to the object store, and the API never handles the file bytes (verified by an API test on the presigned flow).
- [x] An unauthenticated client cannot request an upload or see ingest status.
- [x] Ingest survives an API restart mid-job and completes afterward (Testcontainers test with a real Postgres and a real S3-compatible store).
- [x] The UI shows per-file progress and an "ingesting" state that resolves to the finished track without a manual refresh.
- [x] With an empty library, the UI shows an empty state that leads to the upload screen.
- [x] UI tests against the MSW mock cover the upload progress and ingest state transitions.

## Comments

- Real-audio test library: `H:\AUDIO` on the dev machine (local only, not in the repo, and the files are not to be copied into it). Use it for manual and exploratory checks of this ticket. Automated tests should keep generating small fixture files instead.
- Done. Decisions are in ADR 0005. Also done early, for ticket 06: the 250 MB limit is enforced on the client and on the API (declared size and stored size), and the SHA-256 is computed and stored on the track but not yet used.
- Not yet done, left for 06: format sniffing, deduplication, dominant color, licence, retry policy and the retry button, content-addressed audio keys. Audio keys are `audio/<upload-id>.<ext>` for now.
- Verified on the live stack with a real MP3 from `H:AUDIO` (tags, cover and duration read; the signed upload went through Caddy). A read-only smoke test, `AudioLibrarySmokeTest`, reads every MP3 in a folder when `OSSM_AUDIO_DIR` is set: all 209 in `H:AUDIO` were readable.
