# 18: Playwright smoke test (optional)

**Parent:** docs/specs/01-phase-1-core-app.md
**Status:** ready-for-agent
**Blocked by:** 08 (Queue and full player)

## What to build

One end-to-end browser test against the full compose stack that proves the core journey works: set up the admin, log in, upload a file, see it in the library, and play it. This is optional for Phase 1 to be considered done, but it is the strongest single artifact showing the whole system works.

- Playwright test runs against the real compose stack (real backend, real Postgres, real object store), not the MSW mock.
- Uses a small, license-safe audio fixture.
- Runs in CI as a separate job.

## Acceptance criteria

- [ ] The test performs first-run setup, login, upload, waits for ingest to finish, finds the track, plays it, and asserts that playback position advances.
- [ ] The test is deterministic (no fixed sleeps; waits on observable state).
- [ ] CI runs it on pull requests and publishes the trace and video on failure.
- [ ] The test does not depend on any secrets or external network services.

## Comments

- Real-audio test library: `H:\AUDIO` on the dev machine (local only, not in the repo, and the files are not to be copied into it). Use it for manual and exploratory checks of this ticket. Automated tests should keep generating small fixture files instead.
