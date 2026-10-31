# 20: Video upload, ingest and a movie appears (MP4 happy path)

**Parent:** docs/specs/03-video-library.md
**Status:** ready-for-agent
**Blocked by:** 19 (Video spike)

## What to build

The video pipeline end to end for the simplest case: a user uploads an MP4, ingest probes it and takes a thumbnail, and it appears as a Movie in a basic Videos list.

- Contract first: upload `kind` (`AUDIO`/`VIDEO`), paged part URLs, video list and detail, thumbnail endpoint.
- Migration: `video` table (kind, title, year, duration, width, height, codecs, container, bitrate, playable, content hash, object key, size, thumbnail key, license, uploader, created) and `upload.kind` plus `upload.video_id`.
- Per-kind size cap: 250 MB audio, 20 GB video (`ossm.ingest.max-video-bytes`), enforced on the client, on the declared size and on the stored size.
- Part URLs issued in pages so a 20 GB upload does not presign every part up front. The web uploader asks for the next page as it goes.
- `MediaProbe` port with an ffprobe/ffmpeg adapter (ADR 0009): probe over a presigned GET URL, thumbnail at 10% of duration, stored under `thumbs/`.
- ffmpeg in the API Dockerfile and in CI.
- Web: upload screen accepts video and shows the right cap and formats; a basic `/videos` grid of thumbnails and titles.

## Acceptance criteria

- [ ] Uploading an MP4 ends with a Movie showing correct title, duration, resolution and a thumbnail (Testcontainers test, fixture generated with ffmpeg).
- [ ] A 300 MB video is accepted; a video over the cap is refused before upload starts and again by the API.
- [ ] Part URLs are paged; the upload test covers asking for a second page.
- [ ] Audio uploads behave exactly as before (existing tests stay green).
- [ ] Unauthenticated clients cannot upload video or read the list.
- [ ] UI tests cover video upload progress and the ingesting state.

## Comments

- 2026-10-31, web: the video contract is in `contract/openapi.yaml`, with every new operation and schema marked `x-ossm-planned: true` (the backend's contract test skips those). Remove the marker for each operation as it is served. The `/videos` grid, cards and thumbnails are built and tested against MSW. Not done: the upload screen changes (kind, 20 GB cap, paged part URLs, GB progress). They change the existing upload schemas, so they belong with this ticket's backend work.
