# 27: Video on mobile, accessibility and docs

**Parent:** docs/specs/03-video-library.md
**Status:** ready-for-agent
**Blocked by:** 21 (Stream and watch a video), 24 (Subtitles), 15 (Mobile experience)

## What to build

- Watch page on phones: full-width player, native fullscreen and orientation, touch controls, iOS inline playback.
- Accessibility: labelled controls, focus order, captions reachable by keyboard, reduced motion for the next-episode countdown.
- README: video support, formats, the playability badge, disk use, ffmpeg in the image. Demo seeding with an open-licensed film (spec 03 notes).
- Update PROGRESS.md and CONTEXT.md.

## Acceptance criteria

- [ ] A real-device check on iOS Safari and Android Chrome is recorded in a comment here.
- [ ] Axe checks pass on `/videos`, a show page and the watch page.
- [ ] README describes video support and its limits.

## Comments

- 2026-10-31: README now describes video support, formats, the playability badge, disk use and ffmpeg in the image. PROGRESS.md is updated. The rest of this ticket is untouched.
