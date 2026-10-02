# 01: Walking skeleton

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** done
**Blocked by:** None (can start immediately)

## What to build

The thinnest possible end-to-end system that every later slice builds on. A contributor can clone the repo, run one compose command, open the site in a browser, see the OSSM app shell rendered with the DESIGN.md look, and see that the API is healthy through the same origin.

- Monorepo with separate areas for the backend, web app, deployment files and docs.
- Backend: Spring Boot on the latest Java LTS with virtual threads, Gradle, Flyway wired to Postgres, a health endpoint and structured JSON logging.
- Web: Next.js (App Router, strict TypeScript) with DESIGN.md tokens as CSS custom properties mapped into Tailwind, the three fonts, light-default theme with dark and system switching, and the empty app shell (sidebar, top bar, bottom player area, mobile tab bar).
- Compose stack: reverse proxy (Caddy), web, api, Postgres and the S3-compatible store, reachable on a single origin.
- Contract: a first OpenAPI spec (health only), a typed TypeScript client generated from it and used by the web app, and a CI check that the running backend matches the committed spec. MSW is set up for UI tests.
- CI (GitHub Actions): backend build and tests with Testcontainers, formatting and lint, web typecheck/lint/unit tests, OpenAPI drift check, Docker image builds.
- Conventions: MIT license, README stub, empty `CONTEXT.md` glossary and `docs/adr/` to be filled lazily, first ADRs for decisions already made (object-store choice, Postgres, contract-first API).

## Acceptance criteria

- [x] One compose command brings up the full stack and the site loads over the proxy on one origin.
- [x] The web app renders the app shell per DESIGN.md in light, dark and system themes, responsive at mobile, tablet and desktop widths.
- [x] The web app's health indicator (or equivalent) calls the API through the generated client and shows success.
- [x] CI runs on every push and passes: backend tests using a real Postgres via Testcontainers, web tests, lint, OpenAPI drift check, image builds.
- [x] Changing the backend's API without updating the committed OpenAPI spec fails CI.
- [x] README explains how to run the stack and the project layout.
