# 17: Deploy and demo

**Parent:** docs/specs/01-phase-1-core-app.md
**Status:** ready-for-agent
**Blocked by:** 16 (Polish and accessibility pass)

## What to build

A public demo anyone can click, and the documentation that makes the project read as finished.

- Production compose configuration with automatic HTTPS from the reverse proxy, secrets handled outside the repo, and persistent volumes for Postgres and the object store.
- Deploy to a small VPS with a custom domain.
- Seed the demo with CC-BY, CC0 or public-domain music (license chip visible), a demo account, and a scheduled daily reset that restores the seed state.
- Operations basics: health endpoints monitored, structured JSON logs, backup note for Postgres and the object store.
- Documentation: README with screenshots or a short demo video, architecture overview (modules, upload and ingest flow, streaming path, event design and the plan for Kafka and ClickHouse), run and deploy instructions, and a "future work" list mirroring the out-of-scope items.

## Acceptance criteria

- [ ] The demo site loads over HTTPS, and a visitor can log in with the demo account, browse, search and play music.
- [ ] Seed music is only CC-BY, CC0 or public domain, and each track shows its license.
- [ ] The daily reset runs and returns the demo to its seed state (verified once manually and documented).
- [ ] The object store is not reachable from the public internet.
- [ ] README includes a live demo link, screenshots or video, the architecture overview, and quick-start instructions that work from a clean clone.
- [ ] A short "how to run your own instance" guide exists.
