# 23: Shows, seasons and editing video metadata

**Parent:** docs/specs/03-video-library.md
**Status:** in-review (no test yet for 403 on edit)
**Blocked by:** 22 (Video ingest hardening)

## What to build

- Contract and API: list shows, show detail (seasons with ordered episodes), and `PATCH /api/v1/videos/{id}` to change kind, title, year, show, season, episode number and episode title. Moving an episode to a new show name creates or reuses that show; an empty show is removed.
- Who can edit: the uploader and admins.
- Web: `/videos` gets Movies and Shows tabs; `/videos/shows/[id]` lists seasons and episodes with thumbnails; an edit dialog on the watch page.
- "Next episode" at the end of an episode, with a short countdown that can be cancelled.

## Acceptance criteria

- [ ] Episodes are grouped by show and season and ordered by episode number (API test).
- [ ] Turning a misparsed Movie into an Episode moves it into the show (API and UI test).
- [ ] A user who is neither the uploader nor an admin gets 403 on edit.
- [ ] Next episode starts the following episode, crossing into the next season.

## Comments

- 2026-10-31, web: the Shows tab, show page (season tabs, resume) and the Edit details dialog (PATCH) are built. The next-episode card with its 10 s countdown is built too. The show picker uses the browser's suggestion list rather than the custom dropdown in the design.

- 2026-10-31, backend: `GET /shows`, `GET /shows/{id}` (seasons, episodes in order, `resume`) and `PATCH /videos/{id}` for the uploader or an admin. Moving to a new show name creates it; an empty show is removed. `VideoFlowTest` covers filing episodes under their show. Not yet tested: 403 for someone else's video.
