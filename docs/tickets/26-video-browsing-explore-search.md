# 26: Videos in navigation, Explore and search

**Parent:** docs/specs/03-video-library.md
**Status:** in-progress (search not started)
**Blocked by:** 23 (Shows and metadata editing), 25 (Watch progress), 12 (Search)

## What to build

- Sidebar Videos entry; Movies and Shows lists virtualized and paged with `X-Total-Count` like the music library.
- Explore: "Continue watching" and "Recently added videos" carousels, hidden when empty.
- Search (ticket 12's endpoint) returns movies, shows and episodes as extra groups; the palette shows them.
- Empty states that lead to upload.

## Acceptance criteria

- [ ] Explore shows the two video rows only when there is something to show.
- [ ] Searching a movie title, show name or misspelled episode title finds it (API test).
- [ ] Lists stay smooth with a few thousand videos (paging test).

## Comments

- 2026-10-31, web: the sidebar Videos item (mobile reaches it from Library), the virtualized Movies and Shows grids, and the Explore "Continue watching" and "Recently added videos" rows are built. Not done: search.

- 2026-10-31, backend: paged `GET /videos` and `GET /shows` with `X-Total-Count`, plus `/videos/recent` for Explore. Search still covers music only.
