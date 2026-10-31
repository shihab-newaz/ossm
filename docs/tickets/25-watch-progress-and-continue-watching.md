# 25: Watch progress, resume and Continue watching

**Parent:** docs/specs/03-video-library.md
**Status:** in-review (ADR 0008 addendum on video play events not written)
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

- 2026-10-31, web: resume with "Start over", the watched threshold (`web/src/video/progress.ts`), throttled progress reports (15 s, on pause, after a seek, keepalive on pagehide) and progress bars and watched checks on thumbnails are built. Still to decide: whether video emits play events (ADR 0008 addendum).

- 2026-10-31, backend: `PUT /videos/{id}/progress` (last write wins, watched at 90% or under 2 minutes left) and `GET /videos/continue-watching` (one entry per show, watched items dropped). Progress resuming across sessions is in `VideoFlowTest`. Undecided: whether video sends play events.
