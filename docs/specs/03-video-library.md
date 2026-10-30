# Spec 03: Video library (movies and shows, direct play)

Status: ready-for-agent

## Problem Statement

OSSM holds my music, but my own video files (films, series, home recordings) still live in folders or in a separate server. I want them in the same self-hosted app, behind the same accounts, with the same polish: upload from the browser, a browsable library, and a player that remembers where I stopped. As a portfolio project, video also shows that the upload, ingest and streaming pipeline holds up for files a hundred times larger than audio.

## Solution

A second library in the same instance, next to music. Users upload video files from the browser (direct to the store, as with audio). An ingest job probes each file with `ffprobe`, grabs one thumbnail frame with `ffmpeg`, deduplicates by content hash, decides whether the browser can play it as-is, and classifies it as a **Movie** or an **Episode** of a **Show** from its filename. Users browse Movies and Shows, open a watch page, and play the file directly through the API with range requests (no transcoding). Sidecar and embedded text subtitles are offered as WebVTT tracks. Watch progress is recorded per user so playback resumes and a "Continue watching" row appears.

Work starts now and runs alongside the rest of Phase 1 (tickets 12 to 18). Tickets for this spec are 19 to 27.

## User Stories

### Upload and ingest
1. As a user, I want to drop video files on the same upload screen as audio, so that adding videos needs no new workflow.
2. As a user, I want files up to 20 GB accepted (configurable by the operator), so that full-length films fit.
3. As a user, I want per-file progress and resumable-feeling uploads for multi-GB files, so that I know a big upload is still moving.
4. As a user, I want MP4, M4V, MOV, WebM and MKV accepted, verified by file content rather than extension, so that renamed junk is rejected.
5. As a user, I want duration, resolution, video codec, audio codec(s), bitrate and container recorded, so that I can see a quality badge (for example "1080p · H.264").
6. As a user, I want a thumbnail taken from the video at ingest, so that the library shows a picture for every video.
7. As a user, I want a file the browser cannot play directly (for example HEVC in MKV on Firefox) still accepted but marked "may not play in this browser", so that I am warned rather than blocked.
8. As a user, I want the same file uploaded twice recognised and skipped, so that the library has no duplicates.
9. As a user, I want `Show Name S01E02.mkv`, `Show.Name.1x02.mp4` and `Movie Title (2019).mp4` understood, so that videos land as episodes or movies without typing.
10. As a user, I want to correct a video's kind, title, year, show, season and episode after upload, so that a misparsed filename is easy to fix.
11. As a user, I want failed video ingests to show a readable reason and a retry button, exactly like audio, so that recovery is the same everywhere.

### Subtitles
12. As a user, I want to upload `.srt` or `.vtt` files with a video (matched by filename, or attached later on the video page), so that I can watch with subtitles.
13. As a user, I want text subtitle streams embedded in MKV/MP4 extracted at ingest, so that subtitles I already have just work.
14. As a user, I want to pick a subtitle track (with its language) or turn them off in the player, so that I control what I see.

### Browsing
15. As a user, I want a Videos section in the sidebar with Movies and Shows tabs, so that video is easy to find but separate from music.
16. As a user, I want a show page listing seasons and episodes in order, so that I can watch a series in sequence.
17. As a user, I want a "Continue watching" row and a "Recently added videos" row on Explore, so that video is part of home.
18. As a user, I want search (ticket 12) to find movies, shows and episodes too, so that one search box covers everything.

### Watching
19. As a user, I want a watch page with a large player, title, metadata, quality badge and uploader line, so that it feels like the album page for video.
20. As a user, I want play/pause, seek with a thumbnail-free scrub bar, volume, fullscreen, picture-in-picture and keyboard shortcuts consistent with the music player, so that controls feel familiar.
21. As a user, I want seeking anywhere in a 20 GB file to start quickly, so that I can jump around without waiting.
22. As a user, I want music to pause when I start a video, so that two things never play at once.
23. As a user, I want playback to resume where I stopped, on any device, so that I can pick up a film later.
24. As a user, I want a video marked watched at 90% (or when fewer than 2 minutes remain), so that finished items leave Continue watching.
25. As a user, I want "Next episode" offered at the end of an episode, so that series play in order.
26. As a user, I want only authenticated users to stream video, so that my library stays private.

### Operations
27. As the operator, I want `ffmpeg`/`ffprobe` shipped in the API image and used only for probing, thumbnails and subtitle extraction, so that CPU use stays small and predictable.
28. As the operator, I want the video size cap and ffmpeg timeouts configurable, so that I can match my hardware and disk.

## Implementation Decisions

**Scope and domain**
- One shared video library per instance, alongside the music library. Video watch progress is per user.
- Two kinds of video: **Movie** (title, year) and **Episode** (show, season number, episode number, optional episode title). A **Show** groups episodes by season. No seasons table: season is a number on the episode.
- Videos and tracks are separate domain types and tables. They share the upload, ingest queue, storage and streaming machinery, not a table.

**Ingest (ADR 0009)**
- `ffprobe` and `ffmpeg` are added to the API image and run as child processes with a timeout. They are used for probing, one thumbnail frame, and extracting text subtitles. Never for transcoding.
- `ffprobe` reads the object over an internal presigned GET URL, so probing uses range reads and does not download the whole file. The SHA-256 is computed by a separate streaming read (no temp file).
- What a file is comes from its bytes: magic numbers for ISO BMFF (MP4/M4V/MOV) and EBML (WebM/MKV) decide that a file is video; `ffprobe` then gives the streams. A file with no video stream is rejected (an audio file goes down the audio path).
- **Playable** is computed at ingest from container plus codecs: MP4/M4V/MOV with H.264, HEVC or AV1 video and AAC, MP3, Opus or FLAC audio; WebM with VP8, VP9 or AV1 and Vorbis or Opus. Anything else (including all MKV) is stored with `playable = false` and gets the "may not play in this browser" badge. The player still tries.
- Thumbnail: one JPEG frame at 10% of the duration (clamped to 5 s – 5 min), scaled to 640 px wide, stored content-addressed under `thumbs/`.
- Filename parsing is a pure function with unit tests: `SxxEyy`, `NxNN`, and `Title (Year)` patterns, with separators `.`, `_` and space. No match gives a Movie titled after the filename.
- Video objects are stored at `video/<upload-id>.<ext>`, subtitles at `subs/<video-id>/<n>.vtt`. SRT is converted to WebVTT at ingest.
- The upload table gains a `kind` (`AUDIO` or `VIDEO`). The size cap is per kind: 250 MB audio, 20 GB video by default (`ossm.ingest.max-video-bytes`).
- Part URLs: at 16 MiB parts a 20 GB file needs about 1,280 parts. Part URLs are issued in pages (the client asks for the next batch) rather than all at upload start.

**Streaming**
- `GET /api/v1/videos/{id}/stream` follows ADR 0006 unchanged: authenticated, single byte range passed through to the store, content type from the container. `GET /api/v1/videos/{id}/thumbnail` and `GET /api/v1/videos/{id}/subtitles/{n}` follow the cover endpoint rules.

**Watch progress**
- A `watch_progress` row per user and video (position, duration, watched flag, updated time), written by a throttled client report (every 15 s while playing, plus on pause, seek end and page hide). Last write wins, so it is not part of the play-event envelope. Whether video gets `play_started`/`play_completed` events for Phase 2 analytics is decided in ticket 25 with an addendum to ADR 0008.

**API contract**
- New endpoint groups, authored in `contract/openapi.yaml` first: videos (list, movies, shows, show detail, video detail, edit metadata), video stream, thumbnail and subtitles, subtitle upload, watch progress, continue watching. Uploads gain the `kind` field and paged part URLs.

**Frontend**
- New routes: `/videos` (Movies and Shows tabs), `/videos/shows/[id]`, `/watch/[id]`. Sidebar gets a Videos entry.
- The video player is its own engine module beside `player/player.ts` (same `getState`/`subscribe` shape, ADR 0007 pattern) but separate: it has no queue and lives on the watch page, not in the root layout. Starting a video pauses the music engine.
- The watch page uses the dark theme like the full-screen music player. Tiles use the existing DESIGN.md tokens. Thumbnails are 16:9.
- Upload screen accepts both kinds and shows the right cap and format list.

## Testing Decisions

- Same seams as spec 01: HTTP API tests against real Postgres and a real S3-compatible store (Testcontainers), and Vitest + Testing Library + MSW in the web app.
- Fixture videos are generated in tests with `ffmpeg` (a few seconds of test pattern in MP4, WebM and MKV, plus one with an embedded SRT). No real films in the repo. The Testcontainers suite needs `ffmpeg` on the test machine and in CI.
- Pure unit tests are fine for the filename parser, the playability rule, SRT-to-VTT conversion and the watched threshold.
- The video engine is tested with a fake media element, as the audio engine is.

## Out of Scope

- Transcoding, HLS/DASH, adaptive bitrate, quality switching, hardware acceleration.
- Trickplay (scrub-bar thumbnails), chapters, intro skip, multiple audio track switching (the browser's default track plays).
- External metadata (TMDB, TVDB), posters and artwork downloads, cast and crew.
- Image-based subtitles (PGS, VobSub), burned-in subtitles.
- Casting (Chromecast, AirPlay beyond what the browser gives), offline download, sync-play.
- Per-user video libraries, parental ratings, collections.
- Importing an existing folder or bucket.

## Further Notes

- This reverses spec 01's "no ffmpeg" for the video path only. Audio ingest stays pure JVM. See ADR 0009.
- HLS can be added later as a separate phase without changing the domain model: it would add renditions per video, and `playable = false` videos would be the first candidates.
- The demo instance should seed only public-domain or CC-licensed video (for example Blender open movies), and the license chip applies to videos too.
- Disk: a few films is tens of GB. The README must say so before the demo seeds video.
