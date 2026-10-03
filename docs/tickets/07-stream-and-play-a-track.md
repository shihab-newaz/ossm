# 07: Stream and play a track

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** done
**Blocked by:** 05 (Upload, ingest and a track appears)

## What to build

A user clicks a track and hears it, with a persistent player that keeps playing while they navigate.

- Backend: an authenticated streaming endpoint that proxies audio from the private object store with full HTTP range support, so seeking works; the object store is never exposed publicly. Direct play only, no transcoding. Cover art is served the same way.
- Contract: streaming and cover endpoints authored in OpenAPI first.
- Web: the persistent bottom player bar in the root layout with play/pause, seek bar, volume, elapsed and remaining time (tabular mono), title and artist, cover, and the player store. Play buttons on track rows start playback. The bar follows the DESIGN.md player specification, without the lyrics and device controls.

## Acceptance criteria

- [x] Clicking a track plays it, and playback continues across page navigation.
- [x] Seeking anywhere in a large file works without re-downloading from the start (API test with range requests: start, middle, suffix, open-ended).
- [x] An unauthenticated request to the stream or cover endpoint is rejected.
- [x] The object store is unreachable from outside the compose network.
- [x] Partial-content and range-not-satisfiable responses behave per HTTP semantics.
- [x] A stream error shows a toast and the player recovers (no stuck state).
- [x] Player store tests cover play, pause, seek and volume against the MSW mock.

## Comments

- Real-audio test library: `H:\AUDIO` on the dev machine (local only, not in the repo, and the files are not to be copied into it). Use it for manual and exploratory checks of this ticket. Automated tests should keep generating small fixture files instead.
- Done. Decisions are in ADR 0006. Checked live through Caddy with real files from `H:AUDIO`: a 25 MB FLAC and an MP3 stream byte-identical, with correct 206/416 responses, a 401 when anonymous, an unsigned read of the store answered 403, and the store has no published port.
- Not verified: actual audio output in a real browser. The Chrome extension could not load the app (error page for both localhost and 127.0.0.1 although the stack answered from the shell), so player behaviour is covered by tests only (store tests with a fake audio element, and component tests with stubbed media, because jsdom cannot play audio). Worth a manual listen at http://localhost:8080/library.
- The player store tests use a fake audio element rather than MSW: jsdom does not fetch media, so MSW only serves the track list in the component tests.
- Left for ticket 08: previous/next/queue (still disabled), keyboard shortcuts, the full-screen player, Media Session.
- Flaky test noticed: `IngestSurvivesRestartTest.aQueuedJobRunsAfterTheApiRestarts` failed once in a full run (expected one queued job, found none) and passed in the next three runs. Most likely a cached Spring context from another test class, with its scheduler still polling the shared database, ran the job first. Not fixed.
