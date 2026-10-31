# Progress

Where OSSM stands against `docs/specs/01-phase-1-core-app.md`. Tickets are in `docs/tickets/`; this file is the summary. Last updated 2026-10-31, on the `video-library` branch.

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
| 12 | Search | in-review: palette checked in Chrome; phone width and the large library still to look at |
| 13 | Favorites and History | in-review: like, Liked, History and L checked in Chrome; the pop animation and phone width still to look at |
| 14 | Playlists | ready |
| 15 | Mobile experience | deferred |
| 16 | Polish and accessibility pass | ready |
| 17 | Deploy and demo | ready |
| 18 | Playwright smoke test (optional) | deferred |

"in-review" means the code and automated tests are finished and CI is green, but nobody has looked at it in a real browser yet.

## Video library (spec 03)

Spec: `docs/specs/03-video-library.md`. Started 2026-10-30 and runs alongside the rest of Phase 1. Decisions: a general library of movies and shows, played straight from the file (no transcoding), ffmpeg used only for probing, thumbnails and subtitles (ADR 0010), MP4/MOV/WebM/MKV accepted, 20 GB cap, sidecar and embedded text subtitles.

| # | Ticket | Status |
| --- | --- | --- |
| 19 | Video spike | skipped: built without it; the browser playability checks it planned are still open |
| 20 | Video upload and ingest (MP4 happy path) | in-review: first real upload is the manual QA |
| 21 | Stream and watch a video | in-review: Media Session and a real-browser check still to do |
| 22 | Video ingest hardening | in-progress: MOV, WebM, MKV and timeout fixtures not yet tested |
| 23 | Shows and metadata editing | in-review: no test yet for 403 on edit |
| 24 | Subtitles | in-review: no embedded-subtitle fixture test yet |
| 25 | Watch progress and Continue watching | in-review: ADR 0008 addendum on video play events not written |
| 26 | Videos in navigation, Explore and search | in-progress: search not started |
| 27 | Video on mobile and polish | ready (README part done) |

Backend and web are both built and every video operation is served; no contract entry is marked `x-ossm-planned` any more. The three `VideoFlowTest` tests that ingest a real video need ffmpeg and are skipped on a machine without it; CI installs it.

## What works today

- **Auth:** first-run setup, cookie sessions stored in Postgres, ADMIN and USER roles, invites, user management. Unauthenticated `/api/**` returns 401.
- **Upload and ingest:** direct-to-store uploads, a Postgres job queue, tag and cover extraction, retry of failed ingests, and recovery after a restart.
- **Streaming:** audio is streamed through the API with range requests (ADR 0006).
- **Player:** queue, shuffle, repeat, gapless-style preloading, keyboard shortcuts, state saved in localStorage (ADR 0007).
- **Playback events:** `play_started`, `play_completed` (after 30 s or 50% of the track actually heard) and `skipped`, sent through a localStorage outbox with retry and stored in Postgres (ADR 0008).
- **Library:** Tracks, Albums and Artists tabs with virtualized lists, album and artist pages, genre filtering, paged endpoints with `X-Total-Count`.
- **Explore (home):** featured banner, genre tiles, Recently added and Most played carousels.
- **Search:** one endpoint over Postgres trigrams and prefix full text (ADR 0009), a command palette on Ctrl/Cmd+K and "/", and a full results page.
- **Favorites and History:** like from any track row or the player bar (or press L), a Liked page and a History page. The like state is consistent everywhere without a reload.
- **Most played:** the endpoint and the Explore carousel exist; there is no screen of its own.
- **Video upload:** music and video in one upload screen, whole folders by drag or "Choose a folder", 20 GB per video with part URLs handed out 200 at a time, and `.srt`/`.vtt` files attached to the video with the same name.
- **Video ingest:** container from the bytes, ffprobe for streams, SHA-256 dedupe, a thumbnail, embedded text subtitles to WebVTT, and movie/episode filing from the filename (ADR 0010).
- **Watching:** Movies and Shows grids, show pages with seasons, a dark watch page with keyboard shortcuts, subtitles, resume, next-episode countdown, Edit details, and Continue watching and Recently added rows on Explore. Videos stream from the file with range requests; there is no transcoding.
- **API guide:** `docs/api.md`, with Swagger UI at `/api/docs`.

## Numbers

- Migrations V1 to V9.
- Web: 318 tests. Backend: 182 tests (4 skipped locally: 3 need ffmpeg, 1 needs a music folder), plus the restart tests, all run in CI.
- ADRs 0001 to 0010.

## Known gaps

- **No real-browser check yet** of the tile, banner and album-page looks, scroll feel with thousands of rows, carousel arrows, OS media keys, or gap smoothness between tracks.
- **Tracks without an album** are not grouped as singles in the Albums tab, and never appear in Recently added or the featured banner.
- **Album "Uploaded by"** names the uploader of the first track only.
- **Tab close** does not flush a pending `skipped` event.
- **Background tabs:** a play over 30 s may be missed if progress updates arrive more than 2 s apart. This is a suspicion, not a confirmed bug. A fix would compare against wall-clock time.
- **Search** has no accent folding ("Beyonce" does not find "Beyoncé"), and one-letter queries are the slowest (about 240 ms on 6,000 tracks).
- **History** is a flat list with a time on each row, not grouped under day headings.
- **Queue drawer rows** have no like heart yet.
- **Video image size:** ffmpeg makes the API image about 1.2 GB, not the 80–100 MB more that ADR 0010 first guessed.
- **Video search:** search finds music only.
- **Video playability** is a rule from spec 03, not yet checked in Firefox and Safari (ticket 19's open part).
- **Video in Media Session** (OS media keys and lock screen) is not wired up.

## Test infrastructure notes

- `IngestSurvivesRestartTest` runs in its own Gradle task and JVM (`restartTests`, after `test`). Cached Spring contexts from other classes kept polling the shared database and took its jobs, which made it flaky.
- `pnpm check:api` fails while a regenerated `schema.d.ts` is uncommitted. Commit it and it passes.

## Next

1. A real-browser pass over tickets 08, 10, 11, 12 and 13, and the video QA with a real folder of videos.
2. Ticket 14: playlists.
3. Ticket 16: the polish and accessibility pass (desktop only, while 15 is deferred).
4. Ticket 17: deploy and demo.

## Deferred

Set aside on 2026-10-10; the tickets are kept in `docs/tickets/`.

- **15, Mobile experience.** What stays undone: the 64px mini-player expanding to a full-screen player with swipe-down dismissal, and its dark blurred-cover look (spec 01 stories 60 and 61). The queue button is still hidden below the `lg` breakpoint, so on a phone the queue cannot be opened. The bottom tab bar and the compact player exist, but nothing has been looked at at phone width, including the search palette and the Liked and History links on the Library page.
- **18, Playwright smoke test.** There is no end-to-end test of setup, login, upload and play against the compose stack; the Testcontainers and MSW suites are the only automated cover.
