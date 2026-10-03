# 13: Favorites and History

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** ready-for-agent
**Blocked by:** 09 (Playback events), 10 (Library browsing)

## What to build

Per-user memory of what the user likes and what they listened to.

- Like and unlike tracks from anywhere (track rows, player bar, album pages) with the DESIGN.md toggle animation; the like state is consistent everywhere without a reload.
- Liked page listing the user's favorites.
- History page listing recently played tracks, derived from the qualifying plays in the playback events.
- Backend: favorite and history endpoints authored in OpenAPI first; favorites and history are per user and never visible to other users.

## Acceptance criteria

- [ ] Liking a track updates every place it appears immediately and persists across reloads.
- [ ] The Liked page lists exactly the user's favorites and supports playing them.
- [ ] The History page shows qualifying plays only, most recent first, without duplicates from the same listen.
- [ ] One user's favorites and history are never returned to another user (API test).
- [ ] The L keyboard shortcut likes the current track.
- [ ] Empty Liked and History pages have guiding empty states.
- [ ] UI and API tests cover like/unlike, optimistic update with rollback on failure, and history ordering.

## Comments
- From 08: the "L" (like) keyboard shortcut is not wired yet. Add it to `web/src/player/keymap.ts` (`handleShortcut` and the `SHORTCUTS` list that the help dialog renders) and cover it in `queueUi.test.tsx`.
