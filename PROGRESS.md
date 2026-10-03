# Progress

Where OSSM stands against `docs/specs/01-phase-1-core-app.md`. Tickets are in `docs/tickets/`; this file is the summary. Last updated 2026-10-03, at commit `fc6225a`.

## Tickets

| # | Ticket | Status |
| --- | --- | --- |
| 01 | Walking skeleton | done |
| 02 | SeaweedFS spike | done |
| 03 | First-run setup, login and sessions | done |
| 04 | User management | done |
| 05 | Upload, ingest, MP3 happy path | done |
| 06 | Ingest hardening | done |
| 07 | Stream and play a track | done |
| 08 | Queue and full player | in-review: two criteria need a manual check |
| 09 | Playback events | done |
| 10 | Library browsing | in-review: needs a real-browser look |
| 11 | Explore page | in-review: needs a real-browser look |
| 12 | Search | next |
| 13 | Favorites and History | ready |
| 14 | Playlists | ready |
| 15 | Mobile experience | ready |
| 16 | Polish and accessibility pass | ready |
| 17 | Deploy and demo | ready |
| 18 | Playwright smoke test (optional) | ready |

"in-review" means the code and automated tests are finished and CI is green, but nobody has looked at it in a real browser yet.

## What works today

- **Auth:** first-run setup, cookie sessions stored in Postgres, ADMIN and USER roles, invites, user management. Unauthenticated `/api/**` returns 401.
- **Upload and ingest:** direct-to-store uploads, a Postgres job queue, tag and cover extraction, retry of failed ingests, and recovery after a restart.
- **Streaming:** audio is streamed through the API with range requests (ADR 0006).
- **Player:** queue, shuffle, repeat, gapless-style preloading, keyboard shortcuts, state saved in localStorage (ADR 0007).
- **Playback events:** `play_started`, `play_completed` (after 30 s or 50% of the track actually heard) and `skipped`, sent through a localStorage outbox with retry and stored in Postgres (ADR 0008).
- **Library:** Tracks, Albums and Artists tabs with virtualized lists, album and artist pages, genre filtering, paged endpoints with `X-Total-Count`.
- **Explore (home):** featured banner, genre tiles, Recently added and Most played carousels.
- **History API:** `/api/v1/history` and `/api/v1/history/most-played` exist; no screen uses History yet.

## Numbers

- Migrations V1 to V6.
- Web: 235 tests. Backend: the full suite plus the restart tests run in CI.
- ADRs 0001 to 0008.

## Known gaps

- **No real-browser check yet** of the tile, banner and album-page looks, scroll feel with thousands of rows, carousel arrows, OS media keys, or gap smoothness between tracks.
- **Tracks without an album** are not grouped as singles in the Albums tab, and never appear in Recently added or the featured banner.
- **Album "Uploaded by"** names the uploader of the first track only.
- **Tab close** does not flush a pending `skipped` event.
- **Background tabs:** a play over 30 s may be missed if progress updates arrive more than 2 s apart. This is a suspicion, not a confirmed bug. A fix would compare against wall-clock time.
- **L shortcut** (like) is not wired in `web/src/player/keymap.ts`; ticket 13 covers it.

## Test infrastructure notes

- `IngestSurvivesRestartTest` runs in its own Gradle task and JVM (`restartTests`, after `test`). Cached Spring contexts from other classes kept polling the shared database and took its jobs, which made it flaky.
- `pnpm check:api` fails while a regenerated `schema.d.ts` is uncommitted. Commit it and it passes.

## Next

1. Ticket 12: search.
2. Ticket 13: favorites, History and Most played screens, the L shortcut.
3. A real-browser pass over tickets 08, 10 and 11.
