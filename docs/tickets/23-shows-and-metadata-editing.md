# 23: Shows, seasons and editing video metadata

**Parent:** docs/specs/03-video-library.md
**Status:** ready-for-agent
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
