# 13: Favorites and History

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** in-review (code and tests done; the like animation and the two pages need a pass in a real browser, see the last comments)
**Blocked by:** 09 (Playback events), 10 (Library browsing)

## What to build

Per-user memory of what the user likes and what they listened to.

- Like and unlike tracks from anywhere (track rows, player bar, album pages) with the DESIGN.md toggle animation; the like state is consistent everywhere without a reload.
- Liked page listing the user's favorites.
- History page listing recently played tracks, derived from the qualifying plays in the playback events.
- Backend: favorite and history endpoints authored in OpenAPI first; favorites and history are per user and never visible to other users.

## Acceptance criteria

- [x] Liking a track updates every place it appears immediately and persists across reloads.
- [x] The Liked page lists exactly the user's favorites and supports playing them.
- [x] The History page shows qualifying plays only, most recent first, without duplicates from the same listen.
- [x] One user's favorites and history are never returned to another user (API test).
- [x] The L keyboard shortcut likes the current track.
- [x] Empty Liked and History pages have guiding empty states.
- [x] UI and API tests cover like/unlike, optimistic update with rollback on failure, and history ordering.

## Comments
- From 08: the "L" (like) keyboard shortcut is not wired yet. Add it to `web/src/player/keymap.ts` (`handleShortcut` and the `SHORTCUTS` list that the help dialog renders) and cover it in `queueUi.test.tsx`.

- Built, contract first. New: `GET /api/v1/favorites` (paged, newest like first, total in `X-Total-Count`), `GET /api/v1/favorites/ids`, `PUT` and `DELETE /api/v1/favorites/{trackId}` (both idempotent, 204; PUT on an unknown track is 404). `GET /api/v1/history` gained `offset` and `X-Total-Count`. Migration V8 adds `favorite(user_id, track_id, created_at)`, cascading on both foreign keys. Everything is scoped to the session's user.
- Web: the like state is one cached list of ids (`["favorites", "ids"]`), which every heart reads, so a like made in a row, the player bar or with L shows everywhere at once. `Track` does not carry a `liked` field on purpose: no track query had to change, and the queue saved in localStorage cannot hold a stale one. The toggle is optimistic with rollback and a toast. `LikeButton` is in `TrackRow` (so on every track list, album pages included) and the player bar. `/liked` and `/history` are new, listed in the sidebar and linked from the Library page on small screens.
- Tests: 8 backend tests in `FavoritesApiTest` (like and unlike, idempotence, order and paging, per-user isolation, 404, 401, cascade, likes surviving a new login) and 2 in `PlaybackEventsTest` (history paging and total, a listen reported twice listed once); 10 web tests in `favorites.test.tsx` and 2 for the L shortcut in `queueUi.test.tsx`.
- Things to know:
  - History is a flat list with when each play happened ("Today, 2:32 PM", "Yesterday, …", or the date), not grouped under day headings: the list is virtualized, and headings inside it would have meant measuring and positioning them by hand.
  - There is no Most played screen. The endpoint and the Explore carousel exist; a "Most played" view could sit beside Recent on the History page.
  - Likes are for tracks only. Album and artist pages have no like of their own.
  - The ids list is loaded whole. That is fine for thousands of likes; a library of hundreds of thousands would want the `liked` flag on `Track` after all.
  - Row hearts show on hover or focus on desktop, but stay visible once a track is liked and always on touch.
  - The queue drawer rows do not have a heart yet.
  - Tried in Chrome against the rebuilt compose stack: liking from the player bar fills the row's heart at once, the like survives a hard reload, the Liked page lists it, `L` unliked it (and the page went to its empty state), and History lists the earlier play with its date. The like was undone afterwards, so the dev data is as it was.
  - Still not tried: how the 200 ms pop looks, the pages at phone width, and many likes or plays (hundreds of rows) scrolling.
