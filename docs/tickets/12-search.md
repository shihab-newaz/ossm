# 12: Search

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** in-review (code and tests done; the palette needs a pass in a real browser, see the last comments)
**Blocked by:** 05 (Upload, ingest and a track appears)

## What to build

One search box, available everywhere, that finds tracks, albums and artists quickly and forgivingly.

- Backend: a single search endpoint backed by Postgres full-text search plus trigram matching (`pg_trgm`), returning grouped results (top result, tracks, albums, artists). Indexes and any needed extensions are created by migrations. No external search engine.
- Contract: search endpoint authored in OpenAPI first.
- Web: a command palette opened with Cmd/Ctrl+K or "/", debounced input, grouped results with a highlighted top result, clear on Escape, empty state when nothing matches, and a full results page.

## Acceptance criteria

- [x] Searching finds tracks, albums and artists by title, name and partial words.
- [x] Typos and partial input still find the intended item (API test with misspelled queries).
- [x] Results are grouped and the top result is the best match.
- [x] Input is debounced so typing does not send a request per keystroke (UI test).
- [x] The palette opens from anywhere via both shortcuts and is fully keyboard navigable.
- [x] Search is only available to authenticated users and returns data from the shared library.
- [x] Queries are fast on a library of several thousand tracks (simple timing check in the Testcontainers suite).

## Comments

- Real-audio test library: `H:\AUDIO` on the dev machine (local only, not in the repo, and the files are not to be copied into it). Use it for manual and exploratory checks of this ticket. Automated tests should keep generating small fixture files instead.

- Built, contract first. `GET /api/v1/search?q=&limit=` returns `{ top, tracks, albums, artists }`; `top` is `{ type, id }` pointing into the groups. Blank or punctuation-only `q` returns empty groups; `limit` is 1 to 50 (default 8), `q` at most 200 characters. Migration V7 adds `pg_trgm`, a trigger-maintained `search_text` on tracks and albums, and trigram and full-text GIN indexes. The reasoning, thresholds and weights are in ADR 0009.
- Web: `SearchPalette` (Ctrl/Cmd+K or "/", from anywhere, Ctrl+K also from inside a field), the top-bar pill now opens it, and `/search?q=` is the full results page (it is also the mobile Search tab). The palette is a combobox: arrows move, Enter opens the highlighted result (a track plays from the tracks found), Escape clears and then closes. Typing is debounced 200 ms in the palette and 250 ms on the page.
- Tests: 12 backend tests in `SearchApiTest` (partial words, five misspellings, no false matches, artist and album text, ranking, top result and its tie-break, prefixes, blank queries, 401, shared library, limits, a 6,000-track timing check) and 17 web tests in `search.test.tsx`, plus the `/` shortcut test in `queueUi.test.tsx` now expecting the palette.
- Things to know:
  - Worst case measured was about 240 ms over HTTP on 6,000 tracks, for one-letter queries. The test bound is 500 ms.
  - No accent folding: "Beyonce" does not find "Beyoncé" (ADR 0009 says why).
  - Clicking a track plays the tracks found, from that one.
  - `Modal` gained a `palette` variant (no heading or close button, near the top).
  - Tried in Chrome against the rebuilt compose stack (2 tracks): Ctrl+K opens the palette, a typo ("perfc") puts the track on top, "See all" lands on `/search?q=` with the results. That pass found a bug the unit tests missed: the results page did not fill its box when the address changed under it; fixed, with a test.
  - Still not tried: the palette at phone width, against the larger real library in `H:AUDIO`, and the "/" key from a page with the player bar focused.
