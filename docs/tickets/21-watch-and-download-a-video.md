# 21: Watch and download a video

**Parent:** docs/specs/03-video-vault.md
**Status:** ready-for-agent
**Blocked by:** 20

## What to build

Clicking a tile opens `/watch/[id]`: a large player with native controls (play/pause, seek, volume, fullscreen, picture-in-picture), the title, upload date, size and description. Seeking anywhere starts quickly because the stream supports byte ranges. Starting a video pauses the music. A **Download original** button returns the stored file byte-for-byte under its original filename. If the browser raises a media error (for example HEVC in MKV on Firefox), the player is replaced by a "This browser can't play this file" panel that also has Download original.

Behind it: a stream endpoint and a download endpoint following ADR 0006 (authenticated, proxied, one byte range, `416` past the end, clean `404` for a missing object, `Cache-Control: private`), with the owner check first and the content type taken from the container. The download uses `Content-Disposition: attachment` with RFC 6266 filename encoding. The video detail endpoint is scoped to the owner.

## Acceptance criteria

- [ ] API test: a range request returns `206` with the exact bytes, an open-ended range and a suffix range work, a start past the end is `416`, and a malformed range sends the whole file.
- [ ] API test: the download returns bytes identical to the uploaded fixture (SHA-256 matches) with the original filename, including a non-ASCII one.
- [ ] API test: a second user and an admin get `404` on detail, stream and download. A signed-out request is rejected like other API routes.
- [ ] Web test: the watch page renders the details and a working Download original link. A simulated media error shows the can't-play panel with the download button.
- [ ] Web test: starting a video pauses the music engine.
- [ ] Manual check in a browser: an MP4 plays and seeks near the end of a large file quickly.
