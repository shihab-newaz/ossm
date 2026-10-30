# 24: Subtitles

**Parent:** docs/specs/03-video-library.md
**Status:** ready-for-agent
**Blocked by:** 21 (Stream and watch a video), 22 (Video ingest hardening)

## What to build

- Embedded text subtitle streams (SRT, ASS/SSA as plain text, mov_text, WebVTT) extracted to WebVTT at ingest with ffmpeg, with language and title from the stream tags. Image-based subtitles are skipped and noted.
- Sidecar `.srt`/`.vtt` upload: dropped with a video and matched by filename stem (`Movie.en.srt` gives language `en`), or attached later from the watch page. SRT converted to WebVTT (pure function, unit tested). Small files: a plain authenticated POST, not multipart.
- `GET /api/v1/videos/{id}/subtitles` (list) and `/subtitles/{n}` (`text/vtt`).
- Player: subtitle menu with languages and Off; choice remembered per user in localStorage.

## Acceptance criteria

- [ ] An MKV fixture with an embedded SRT stream ends with one subtitle track with the right language.
- [ ] A sidecar SRT dropped with its video is attached; one added later from the watch page appears without reload.
- [ ] SRT-to-VTT unit tests cover timestamps, multi-line cues, BOM and CRLF.
- [ ] Subtitle endpoints require a session.

## Comments
