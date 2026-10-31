# 19: Video spike (ffprobe over presigned URLs, browser playability)

**Parent:** docs/specs/03-video-library.md
**Status:** skipped (the build went ahead without it; the browser checks below are still open)
**Blocked by:** None

## What to build

A time-boxed spike, like ticket 02, to prove the risky parts of spec 03 before building on them. Throwaway code goes in `spikes/video/`; findings go in `docs/spikes/`.

- `ffprobe` and `ffmpeg` against an internal presigned GET URL on SeaweedFS: confirm they read by range (check the store's request count) for MP4 with `moov` at the end, WebM and MKV.
- Thumbnail grab at a timestamp, and SRT/embedded-subtitle extraction to WebVTT, timed on a multi-GB file.
- Streaming a multi-GB MP4 and MKV through the existing range proxy (ADR 0006) in Chrome, Firefox and Safari: seek latency, and which container/codec combinations actually play. This confirms or corrects the playability rule in spec 03.
- Multipart upload of a ~10 GB file through Caddy with 16 MiB parts: browser memory use, and how long presigning ~1,000 part URLs takes.
- Installing ffmpeg in the `eclipse-temurin:25-jre` image: size added.

## Acceptance criteria

- [ ] A findings note in `docs/spikes/` answers each bullet above with numbers.
- [ ] The playability table in spec 03 is confirmed or corrected.
- [ ] ADR 0010 is updated if anything in it turned out wrong.

## Comments

- 2026-10-31, backend: skipped. The pipeline was built directly. Answered along the way: ffprobe and ffmpeg read from an internal presigned URL; installing ffmpeg in `eclipse-temurin:25-jre` makes the API image about 1.2 GB, so ADR 0010 (renumbered from 0009) was corrected. Still open: which container and codec pairs really play in Chrome, Firefox and Safari, seek latency on multi-GB files, and browser memory on a ~10 GB upload.
