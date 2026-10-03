# 10: Library browsing

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** in-review (code and tests done; the look and feel needs a pass in a real browser, see the last comments)
**Blocked by:** 06 (Ingest hardening), 07 (Stream and play a track)

## What to build

Users browse their shared library the way they think about music, and every album and artist has a rich detail page.

- Library with Tracks, Albums and Artists tabs; long lists are virtualized and stay smooth with thousands of items.
- Album page: header wash from the stored dominant color (lightness clamped so white text stays at least 4.5:1), 232px cover, hero title, Amp Orange play button and shuffle, track list with hover play, now-playing equalizer and row actions (visible on hover/focus on desktop, always visible on touch).
- Artist page: albums and tracks.
- Open-metadata line on album and track detail: quality badge (codec and bitrate), license chip with an explanatory popover, and "Uploaded by @user · date".
- Backend: paged list and detail endpoints for tracks, albums and artists, authored in OpenAPI first.
- Skeleton loaders and empty states per DESIGN.md.

## Acceptance criteria

- [x] The three tabs list the ingested library with stable pagination and sorting.
- [x] A library of several thousand tracks scrolls smoothly (virtualized list test).
- [x] The album page shows the wash, cover, metadata line and track list and starts playback from any row.
- [x] Header text contrast stays at least 4.5:1 for light and dark covers.
- [x] The license chip popover explains the license shown on the chip.
- [x] The currently playing track is highlighted with an equalizer animation that respects reduced-motion settings.
- [x] API tests cover list and detail endpoints (paging, ordering, unknown ids, authorization).
- [x] UI tests cover tab switching, row play, and empty and loading states against the MSW mock.

## Comments

- Real-audio test library: `H:\AUDIO` on the dev machine (local only, not in the repo, and the files are not to be copied into it). Use it for manual and exploratory checks of this ticket. Automated tests should keep generating small fixture files instead.

- From 05/06: tracks without an album tag have no album (and so no cover or dominant colour); group them as singles. `GET /api/v1/tracks` already returns `license`, `codec`, `bitrateKbps` and the album's `dominantColor` (#rrggbb, when it has a cover; very dark or very light covers need the lightness clamp the album header specifies).
- From 08: album and artist pages should start playback with `player.playList(tracks, startIndex, { shuffle?, randomStart? })` and use `player.playNext` / `player.enqueue` for row actions, as `LibraryScreen` does.

- Built. Backend: `GET /api/v1/tracks` gained `limit`, `offset` and `sort` (added, title, artist), with the total in an `X-Total-Count` header. It still returns a plain array, so nothing that used it had to change, and it returns everything when no limit is given. New: `/albums`, `/albums/{id}`, `/artists`, `/artists/{id}` (same paging). Every ordering ends in the row id, so pages never overlap or skip. `Track` now also carries `artistId` and `uploadedBy`. Contract first, web types regenerated.
- Web: Library has Tracks, Albums and Artists tabs (the tab is kept in the address as `?tab=`), each with a skeleton, an empty state and an error state. Lists use TanStack Virtual against the window scroll, so only the rows near the screen exist in the page, and pages of 200 load as you scroll. Album page (`/albums/[id]`) and artist page (`/artists/[id]`) are new; track rows link to the artist and album; `UploadScreen` now refreshes albums and artists too.
- Header wash: deliberately not the literal DESIGN.md gradient. The page header is a flat colour from the cover (`library/wash.ts`), with the lightness clamped until white text on it is at least 4.5:1 (a test sweeps 216 colours). A gradient that fades into the page background would put white text over a near-white background in the light theme, which cannot meet 4.5:1.
- Tests: 9 backend tests in `BrowseLibraryTest` (paging that tiles the library, tie-breaking, sort orders, bad paging, detail pages, 404s, 401s) and 32 web tests (tabs, row play, 5000 tracks keep the DOM small, Play all with only a page loaded, sorting, equalizer and reduced motion, wash contrast, license popover, album and artist pages, not-found, loading and empty states).
- Things to know:
  - Tracks without an album are not grouped as "singles" in the Albums tab; they show in Tracks and on their artist page.
  - The "Uploaded by" line on an album is the uploader of its first track; an album with tracks from several uploaders shows only that one.
  - Row actions are always visible on touch devices (a hover:none media query) and on hover or focus on desktop.
  - Not tried in a real browser: scrolling feel with thousands of real rows, the wash against real covers, and the albums grid layout at each breakpoint (the grid uses 2 to 6 columns by window width). Worth a look at http://localhost:8080/library once rebuilt.
  - jsdom does no layout, so the virtualized-list tests stub row height; they prove the DOM stays small, not how smooth scrolling feels.
