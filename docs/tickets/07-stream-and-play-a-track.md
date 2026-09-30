# 07: Stream and play a track

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** ready-for-agent
**Blocked by:** 05 (Upload, ingest and a track appears)

## What to build

A user clicks a track and hears it, with a persistent player that keeps playing while they navigate.

- Backend: an authenticated streaming endpoint that proxies audio from the private object store with full HTTP range support, so seeking works; the object store is never exposed publicly. Direct play only, no transcoding. Cover art is served the same way.
- Contract: streaming and cover endpoints authored in OpenAPI first.
- Web: the persistent bottom player bar in the root layout with play/pause, seek bar, volume, elapsed and remaining time (tabular mono), title and artist, cover, and the player store. Play buttons on track rows start playback. The bar follows the DESIGN.md player specification, without the lyrics and device controls.

## Acceptance criteria

- [ ] Clicking a track plays it, and playback continues across page navigation.
- [ ] Seeking anywhere in a large file works without re-downloading from the start (API test with range requests: start, middle, suffix, open-ended).
- [ ] An unauthenticated request to the stream or cover endpoint is rejected.
- [ ] The object store is unreachable from outside the compose network.
- [ ] Partial-content and range-not-satisfiable responses behave per HTTP semantics.
- [ ] A stream error shows a toast and the player recovers (no stuck state).
- [ ] Player store tests cover play, pause, seek and volume against the MSW mock.
