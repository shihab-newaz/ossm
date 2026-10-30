# 25: Watch progress, resume and Continue watching

**Parent:** docs/specs/03-video-library.md
**Status:** ready-for-agent
**Blocked by:** 21 (Stream and watch a video)

## What to build

- `watch_progress` table (user, video, position, duration, watched, updated) and `PUT /api/v1/videos/{id}/progress` (last write wins).
- Client reports every 15 s while playing, on pause, after a seek, and on `pagehide` (with `sendBeacon` or `keepalive`).
- Resume: the watch page starts at the saved position (with a "Start over" option) unless the video is watched.
- Watched at 90% or fewer than 2 minutes left (pure function, unit tested). A watched marker and progress bar on thumbnails.
- `GET /api/v1/videos/continue-watching`: in-progress items, newest first, one per show (the latest episode).
- Decide whether video also emits play events for Phase 2 and record it as an addendum to ADR 0008.

## Acceptance criteria

- [ ] Progress saved on one browser resumes on another for the same user, and is invisible to other users (API test).
- [ ] Watched threshold unit tests, including very short videos.
- [ ] Continue watching shows one entry per show and drops watched items.
- [ ] Reports are throttled (UI test with fake timers).

## Comments
