# 22: Thumbnails and duration

**Parent:** docs/specs/03-video-vault.md
**Status:** ready-for-agent
**Blocked by:** 21

## What to build

Tiles show a real thumbnail and a duration badge, and the watch page shows resolution. Nothing runs on the server (ADR 0010):
- The **frame grabber** web module takes a local file and returns a 640 px wide JPEG from about 10% in, plus duration, width and height, or "couldn't read".
- During upload the browser keeps the grabber's result. When the upload reaches `DONE`, it saves the thumbnail and metadata through one endpoint.
- When the watch page plays a video that has no thumbnail, it captures a frame from the playing element and saves it through the same endpoint (backfill).
- The server accepts a JPEG up to a small cap, stores it at `video/<owner_id>/<video_id>/thumb.jpg`, and records duration, width and height. A thumbnail GET follows the cover endpoint's rules.

## Acceptance criteria

- [ ] API test: saving a thumbnail and metadata for one's own video works, and the vault list and detail then expose the thumbnail URL, duration and resolution. The thumbnail GET returns the JPEG.
- [ ] API test: a non-JPEG or oversized body is rejected. Another user and an admin get `404`.
- [ ] Web test (grabber faked like `fakeAudio.ts`): after an upload completes, the thumbnail is saved once. If the grabber can't read the file, nothing is saved and the tile keeps its placeholder.
- [ ] Web test: the watch page backfills when the video has no thumbnail, and doesn't when it already has one.
- [ ] Tiles show the duration badge only when the duration is known.
- [ ] Manual check in a browser: the real grabber produces a thumbnail for an MP4 and a WebM, and degrades to a placeholder for an MKV the browser can't decode.
