# 10: Library browsing

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** ready-for-agent
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

- [ ] The three tabs list the ingested library with stable pagination and sorting.
- [ ] A library of several thousand tracks scrolls smoothly (virtualized list test).
- [ ] The album page shows the wash, cover, metadata line and track list and starts playback from any row.
- [ ] Header text contrast stays at least 4.5:1 for light and dark covers.
- [ ] The license chip popover explains the license shown on the chip.
- [ ] The currently playing track is highlighted with an equalizer animation that respects reduced-motion settings.
- [ ] API tests cover list and detail endpoints (paging, ordering, unknown ids, authorization).
- [ ] UI tests cover tab switching, row play, and empty and loading states against the MSW mock.
