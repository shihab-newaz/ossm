# 21: Stream and watch a video

**Parent:** docs/specs/03-video-library.md
**Status:** ready-for-agent
**Blocked by:** 20 (Video upload and ingest)

## What to build

- `GET /api/v1/videos/{id}/stream` under the ADR 0006 rules (auth, single range, 416, 404 on missing object, private cache).
- A video engine module next to `player/player.ts` (ADR 0007 shape, fake-element tests). No queue. Starting a video pauses the music engine.
- `/watch/[id]`: dark watch page with the player, title, metadata, quality badge ("1080p · H.264"), license chip and uploader line.
- Controls: play/pause, seek bar, elapsed/remaining, volume, mute, fullscreen, picture-in-picture. Keyboard: Space, arrows to seek, F fullscreen, M mute, shared with the music keymap where keys overlap.
- Media Session metadata with the thumbnail.

## Acceptance criteria

- [ ] Range requests on a video return 206 with correct `Content-Range`; seeking far into a large file reads only that range (API test).
- [ ] Streaming requires a session; a deactivated user gets 401.
- [ ] Starting a video pauses music; music does not resume on its own.
- [ ] Engine tests cover play, pause, seek, ended and error with a fake element.
- [ ] Keyboard shortcuts work and are listed in the help dialog.

## Comments

- 2026-10-31, web: the watch page, video engine (`web/src/video/engine.ts`, fake-element tests), controls, keyboard shortcuts (listed in the ? dialog) and music pausing are built. The page is forced dark while open. Not done: Media Session for video, and a real-browser check.
