# 11: Explore page

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** in-review (code and tests done; the look needs a pass in a real browser)
**Blocked by:** 10 (Library browsing), 09 (Playback events)

## What to build

The home page that makes the library feel alive, following DESIGN.md Section 10 (built from the user's own library, no podcasts, radio or community sections).

- Featured banner from the library (for example a featured or recently added album).
- "Genres & moods" grid of colored channel tiles generated from genre tags, using the signature tile design (rotated cover art bleeding off the corner, hover animation). Tile color is deterministic from the genre (hash of the slug) so a genre keeps its color everywhere.
- "Recently added" carousel and "Most played" carousel (from playback events), with snap scrolling, arrow buttons on desktop and hover play buttons on cards.
- Optional All/Music filter chips.
- Backend: endpoints for genres with counts, recently added, most played, and featured, authored in OpenAPI first.
- Empty library state that guides the user to upload.

## Acceptance criteria

- [x] Genre tiles are generated from the tags actually present in the library and each genre always gets the same color.
- [x] Most played reflects real qualifying plays (API test that plays change the ranking).
- [x] Recently added orders by ingest time.
- [x] Carousels scroll with snap and have arrow controls on desktop; tiles and cards are keyboard accessible with visible focus.
- [x] Tile rotation and hover effects are disabled under reduced-motion settings.
- [x] A new, empty instance shows an upload-oriented empty state instead of empty sections.
- [x] UI tests cover the populated and empty states against the MSW mock.

## Comments

- Real-audio test library: `H:\AUDIO` on the dev machine (local only, not in the repo, and the files are not to be copied into it). Use it for manual and exploratory checks of this ticket. Automated tests should keep generating small fixture files instead.

- Built. Explore is the home page (`/`) and also `/explore`: featured banner, Genres & moods tiles, Recently added and Most played carousels, and an upload-oriented empty state when the library has no tracks. Sections with nothing in them are left out rather than shown empty. The optional All/Music chips were left out (there is only music).
- Backend (contract first): `GET /api/v1/genres` (from the tags actually present; spellings differing only in case, spacing or punctuation are one genre, and the slug is computed in SQL so grouping and filtering share one definition; works for non-Latin tags), `GET /api/v1/albums/recent` (by the newest track added, so an album rises when a track is added to it), `GET /api/v1/albums/featured` (newest album with a cover, 204 when none), and a `genre` filter on `GET /api/v1/tracks`. Most played reuses `GET /api/v1/history/most-played` from ticket 09, so it is per user and counts qualifying plays only.
- Tiles: flat `--tile-n` colour from an FNV-1a hash of the slug (a test pins three genres so a change to the hash is noticed), cover tilted 18 degrees bleeding off the corner, 12 degrees and lifted on hover. All rotation, scale and transitions use `motion-safe:`, so they are off under reduced motion (a test fails if one loses the prefix; I checked it does). A tile links to `/library?genre=<slug>`, which the Library now understands: the Tracks tab filters and shows a "Genre: X" chip that clears it.
- Home no longer shows the API health line; it moved to Settings under "Server status".
- Tests: 8 backend (genres and counts, spelling merge, non-Latin genres, genre filter and total, recently-added ordering and rising, featured, most played ranking changing as plays arrive, 401s) and 15 web (colours, banner, tiles, carousels with arrow buttons and snap, reduced-motion classes, empty/loading/error states, genre filter and chip).
- Things to know:
  - "Recently added" and the banner are albums, so tracks without an album tag never appear in them.
  - The carousel arrows scroll by 80% of the visible width and are shown from the md breakpoint up; the snap and arrow behaviour is tested for wiring, not for how it feels in a real browser.
  - The tile "Hip-Hop" style genres all share the first-seen most common spelling as their label.
  - Not tried in a real browser: the look of the tiles and banner against real covers.
