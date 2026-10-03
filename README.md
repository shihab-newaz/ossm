# OSSM

**Open Source Streaming Music**: a self-hosted music streaming app for your own files. Spring Boot API, Next.js web UI, Postgres and an S3-compatible object store (SeaweedFS as the reference deployment).

Work is tracked as local markdown: specs in `docs/specs/`, tickets in `docs/tickets/`. Current status is in `PROGRESS.md`. Visual design lives in `DESIGN.md`.

## Run it

You need Docker.

```sh
docker compose -f deploy/compose.yaml up --build
```

Open http://localhost:8080. Caddy serves everything on one origin: `/api` goes to the backend, the rest to the web app. Set `OSSM_PORT` to use another port.

## Develop

| Area | Commands |
| --- | --- |
| Backend (`backend/`, Java 25, Gradle) | `./gradlew test` (needs Docker for Testcontainers; also runs the ingest restart tests in a second JVM), `./gradlew spotlessApply`, `./gradlew bootRun` |
| Web (`web/`, Node 24, pnpm) | `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint` |

For `pnpm dev` to show a healthy API, run Postgres and the backend (`docker compose -f deploy/compose.yaml up -d db`, then `./gradlew bootRun`). The dev server proxies `/api` to `http://localhost:8080`; override with `API_ORIGIN`.

Uploads need the whole compose stack: upload URLs are signed for the address you open the site on and Caddy routes the bucket path to the object store, so they do not work through `pnpm dev` alone. To try the pipeline on real files without putting them in the repo, run `OSSM_AUDIO_DIR=/path/to/music ./gradlew test --tests '*AudioLibrarySmokeTest'` from `backend/` (read-only).

### API contract

`contract/openapi.yaml` is the source of truth. After editing it, regenerate the web client with `pnpm gen:api` (in `web/`). CI fails if the generated client is stale, or if the running backend exposes different operations than the contract.

## Layout

```
backend/    Spring Boot API (Gradle, Flyway migrations)
web/        Next.js app (App Router, Tailwind with DESIGN.md tokens)
contract/   openapi.yaml, the API contract
deploy/     compose stack and Caddy config
docs/       specs, tickets, ADRs, agent docs
```

## What it does today

Sign in, upload MP3s, browse the library (tracks, albums, artists, genres), play with a queue, shuffle and repeat, and see an Explore home page. Plays are recorded as events for history and most-played. Search, favorites, playlists and mobile polish are still to come; see `PROGRESS.md`.

## License

MIT
