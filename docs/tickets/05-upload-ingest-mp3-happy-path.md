# 05: Upload, ingest and a track appears (MP3 happy path)

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** ready-for-agent
**Blocked by:** 03 (First-run setup, login and sessions), 02 (SeaweedFS spike)

## What to build

The core blob pipeline, end to end for the simplest case. A logged-in user drags an MP3 onto the upload screen, it uploads straight to the object store, an asynchronous ingest job processes it, and the track shows up in a basic library list with its tags and cover art.

- Contract: presigned multipart upload, upload-complete, and ingest-status endpoints authored in OpenAPI first.
- Backend: presigned multipart upload issued by the API; upload-complete enqueues an ingest job on the Postgres-backed scheduler behind an `IngestQueue` port; the job reads tags and technical properties on the JVM (no ffmpeg), extracts embedded cover art into the store, and writes normalized artist, album and track rows; job and file status are queryable. Access to the store uses only the vendor-neutral AWS SDK S3 client.
- Web: upload zone (drag and drop or pick multiple files), per-file progress, an "ingesting" state that updates until done, and a basic tracks list so the result is visible. Skeleton loaders, empty state guiding users to upload.
- Data model: artist, album and track tables with the normalized fields from spec 01.

## Acceptance criteria

- [ ] A logged-in user uploads an MP3 and, after ingest, sees the track with correct title, artist, album, duration and cover art.
- [ ] Uploads go directly from the browser to the object store, and the API never handles the file bytes (verified by an API test on the presigned flow).
- [ ] An unauthenticated client cannot request an upload or see ingest status.
- [ ] Ingest survives an API restart mid-job and completes afterward (Testcontainers test with a real Postgres and a real S3-compatible store).
- [ ] The UI shows per-file progress and an "ingesting" state that resolves to the finished track without a manual refresh.
- [ ] With an empty library, the UI shows an empty state that leads to the upload screen.
- [ ] UI tests against the MSW mock cover the upload progress and ingest state transitions.

## Comments

- Real-audio test library: `H:\AUDIO` on the dev machine (local only, not in the repo, and the files are not to be copied into it). Use it for manual and exploratory checks of this ticket. Automated tests should keep generating small fixture files instead.
