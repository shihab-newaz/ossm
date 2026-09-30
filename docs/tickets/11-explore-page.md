# 11: Explore page

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** ready-for-agent
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

- [ ] Genre tiles are generated from the tags actually present in the library and each genre always gets the same color.
- [ ] Most played reflects real qualifying plays (API test that plays change the ranking).
- [ ] Recently added orders by ingest time.
- [ ] Carousels scroll with snap and have arrow controls on desktop; tiles and cards are keyboard accessible with visible focus.
- [ ] Tile rotation and hover effects are disabled under reduced-motion settings.
- [ ] A new, empty instance shows an upload-oriented empty state instead of empty sections.
- [ ] UI tests cover the populated and empty states against the MSW mock.
