# 21: Watch and download a video

**Parent:** docs/specs/03-video-vault.md
**Status:** in-review (code and tests done; the manual check of an MP4 playing and seeking near the end of a large file is still open)
**Blocked by:** 20

## What to build

Clicking a tile opens `/watch/[id]`: a large player with native controls (play/pause, seek, volume, fullscreen, picture-in-picture), the title, upload date, size and description. Seeking anywhere starts quickly because the stream supports byte ranges. Starting a video pauses the music. A **Download original** button returns the stored file byte-for-byte under its original filename. If the browser raises a media error (for example HEVC in MKV on Firefox), the player is replaced by a "This browser can't play this file" panel that also has Download original.

Behind it: a stream endpoint and a download endpoint following ADR 0006 (authenticated, proxied, one byte range, `416` past the end, clean `404` for a missing object, `Cache-Control: private`), with the owner check first and the content type taken from the container. The download uses `Content-Disposition: attachment` with RFC 6266 filename encoding. The video detail endpoint is scoped to the owner.

## Acceptance criteria

- [x] API test: a range request returns `206` with the exact bytes, an open-ended range and a suffix range work, a start past the end is `416`, and a malformed range sends the whole file.
- [x] API test: the download returns bytes identical to the uploaded fixture (SHA-256 matches) with the original filename, including a non-ASCII one.
- [x] API test: a second user and an admin get `404` on detail, stream and download. A signed-out request is rejected like other API routes.
- [x] Web test: the watch page renders the details and a working Download original link. A simulated media error shows the can't-play panel with the download button.
- [x] Web test: starting a video pauses the music engine.
- [ ] Manual check in a browser: an MP4 plays and seeks near the end of a large file quickly.

## Comments
- Built, contract first. New: `GET /api/v1/videos/{id}` (detail), `GET /api/v1/videos/{id}/stream` and `GET /api/v1/videos/{id}/download`, all scoped to the signed-in owner. The range, 416, missing-object and header logic moved out of `StreamController` into a shared `ObjectResponses` (storage package), which music and video both use; `StreamTest` passes unchanged. ADR 0006 has an addendum for the video differences.
- Two choices worth a look: the video responses are `Cache-Control: no-cache, private` rather than a day of `max-age` (a browser shared by two people must not replay one person's video from cache for the other), and the download filename is built by hand (`ContentDispositions`) with an ASCII fallback plus `filename*`, with control characters stripped so a name cannot inject a header.
- Web: `/watch/[id]` with a native `<video controls>` pointed at the stream, the title, upload date, size, container and description, and a Download original link. A media error swaps the player for a "This browser can't play this file" panel that keeps the download. Starting playback calls `player.pause()`. Vault tiles now link to the watch page, and Videos stays highlighted in the nav while watching.
- Tests: 14 in `VideoWatchTest` (full stream and headers, content type from the container, middle/head/open-ended/suffix ranges, 416, malformed and multiple ranges sending the whole file, byte-identical download by SHA-256, a non-ASCII name, a resumed download, detail, 404 for another user and an admin on every route, 404 for an unknown id, 401 signed out, a file missing from the store), 5 in `ContentDispositionsTest`, 9 web tests in `watch.test.tsx`. Backend and web suites pass.
- **Not done:** the manual browser check (an MP4 playing and seeking near the end of a large file). The ranges are covered by tests against the real store, but nobody has watched a real video play yet. Nothing was uploaded to the dev DB for this.
- Known limits: the "can't play" panel also shows if the stream itself fails (for example the session ended), because the browser reports both as a media error. Music pauses when a video starts, but a music track started afterwards does not stop a video that is already playing.
