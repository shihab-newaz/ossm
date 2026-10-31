# 22: Video ingest hardening (all containers, playability, dedupe, filenames)

**Parent:** docs/specs/03-video-library.md
**Status:** in-progress (MOV, WebM, MKV and timeout fixtures not tested yet)
**Blocked by:** 20 (Video upload and ingest)

## What to build

- Sniffing by bytes: ISO BMFF (MP4/M4V/MOV) and EBML (WebM/MKV). A file with no video stream is rejected with a readable reason; an audio file sent as video is pointed to the audio path.
- Playability rule from spec 03 (as corrected by ticket 19) as a pure function. `playable = false` shows a "may not play in this browser" badge, and the watch page shows a clear message if the element errors.
- Dedupe by streamed SHA-256, with the same partial unique index pattern as tracks; a duplicate ends as `DUPLICATE` and its object is deleted.
- Filename parser: `SxxEyy`, `NxNN`, `Title (Year)`, separators `.` `_` and space. An episode match creates or reuses a Show (by normalised name key, like artists).
- Retry policy, ffmpeg timeouts and the admin failures list cover video.

## Acceptance criteria

- [ ] MP4, MOV, WebM and MKV fixtures ingest; a renamed text file and a pure-audio MKV are rejected with readable reasons.
- [ ] An MKV with HEVC ingests as `playable = false` and shows the badge.
- [ ] Uploading the same video twice ends as `DUPLICATE` (including two at once).
- [ ] Parser unit tests cover the patterns in spec 03 story 9 and a no-match fallback.
- [ ] An ffprobe timeout is a terminal failure with a readable reason, and retry works from the upload screen.

## Comments

- 2026-10-31, web: the "may not play in this browser" badge (cards and watch page) and the explanation with "Try anyway" are built, driven by `playable` from the API.

- 2026-10-31, backend: built: byte sniffing (`VideoSniffer`), the playability rule (`Playability`, unit tested), SHA-256 dedupe ending as `DUPLICATE` with the object deleted, the filename parser (`VideoNames`, unit tested), readable failure reasons including timeouts, and retry. Tested: an MP4 and a non-video. Not tested yet: MOV, WebM and MKV fixtures, a pure-audio MKV, two identical uploads at once, an ffprobe timeout.
