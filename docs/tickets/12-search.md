# 12: Search

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** ready-for-agent
**Blocked by:** 05 (Upload, ingest and a track appears)

## What to build

One search box, available everywhere, that finds tracks, albums and artists quickly and forgivingly.

- Backend: a single search endpoint backed by Postgres full-text search plus trigram matching (`pg_trgm`), returning grouped results (top result, tracks, albums, artists). Indexes and any needed extensions are created by migrations. No external search engine.
- Contract: search endpoint authored in OpenAPI first.
- Web: a command palette opened with Cmd/Ctrl+K or "/", debounced input, grouped results with a highlighted top result, clear on Escape, empty state when nothing matches, and a full results page.

## Acceptance criteria

- [ ] Searching finds tracks, albums and artists by title, name and partial words.
- [ ] Typos and partial input still find the intended item (API test with misspelled queries).
- [ ] Results are grouped and the top result is the best match.
- [ ] Input is debounced so typing does not send a request per keystroke (UI test).
- [ ] The palette opens from anywhere via both shortcuts and is fully keyboard navigable.
- [ ] Search is only available to authenticated users and returns data from the shared library.
- [ ] Queries are fast on a library of several thousand tracks (simple timing check in the Testcontainers suite).
