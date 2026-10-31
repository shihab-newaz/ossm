# OSSM

**Open Source Streaming Music**: a self-hosted streaming app for your own music and videos. Spring Boot API, Next.js web UI, Postgres and an S3-compatible object store (SeaweedFS as the reference deployment).

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

[`docs/api.md`](docs/api.md) explains the API: sessions, errors, paging, the upload flow, streaming and every endpoint. Swagger UI for the running backend is at http://localhost:8080/api/docs (the spec it loads is `/api/v3/api-docs`, also served at `/v3/api-docs`). The page is public; the calls it makes use your browser's session cookie, so sign in to the web app first (or call `POST /api/v1/auth/login` from Swagger UI) and "Try it out" acts as that user. Set `SWAGGER_UI_ENABLED=false` on the API to turn it off.

## Layout

```
backend/    Spring Boot API (Gradle, Flyway migrations)
web/        Next.js app (App Router, Tailwind with DESIGN.md tokens)
contract/   openapi.yaml, the API contract
deploy/     compose stack and Caddy config
docs/       specs, tickets, ADRs, the API guide (api.md), agent docs
```

## What it does today

**Music.** Sign in, upload music, browse the library (tracks, albums, artists, genres), play with a queue, shuffle and repeat, search, like tracks, and see your history and an Explore home page. Plays are recorded as events for history and most played.

**Video.** Upload movies and episodes (a whole folder at once, with `.srt`/`.vtt` subtitles next to them), browse Movies and Shows, and watch with subtitles, resume and "Continue watching". Filenames like `Show.S01E02.mkv` and `Film (2019).mp4` are filed as episodes and movies; wrong guesses can be fixed on the watch page.

- Formats: MP4, M4V, MOV, WebM and MKV, up to 20 GB each. Music is up to 250 MB a file.
- Videos play straight from the file, with no transcoding. A file the browser may not play (every MKV, and an MP4 or MOV with audio such as AC-3 or DTS) gets a "may not play in this browser" badge and a "Try anyway" button. Chrome often plays MKV with H.264; Firefox does not play HEVC.
- The API image includes ffmpeg, used only to read a video's details, take a thumbnail and pull out subtitles (ADR 0010). It makes the image about 1.2 GB.
- Disk use is the files themselves plus a small thumbnail per video. Nothing is copied or converted.

Playlists, video search and mobile polish are still to come; see `PROGRESS.md`.

## License

MIT
