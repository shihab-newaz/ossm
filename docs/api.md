# OSSM API

A guide to the HTTP API that the web app uses. Read it to call the API from a script, another client or Swagger UI.

- **Source of truth:** [`contract/openapi.yaml`](../contract/openapi.yaml) (ADR 0003). Every field and status code is there; this page explains how the pieces fit together. When the two disagree, the contract wins, and this page needs fixing.
- **Try it:** Swagger UI on a running stack at http://localhost:8080/api/docs. The spec it loads is `/api/v3/api-docs`.
- **Base path:** `/api/v1`, on the same origin as the web app. In the compose stack Caddy routes `/api` to the backend.

## Conventions

### Sessions

The API uses a cookie session stored in Postgres (ADR 0004). There are no tokens.

1. `POST /api/v1/auth/login` with `{"username", "password"}` sets the `OSSM_SESSION` cookie. The cookie is HttpOnly and SameSite=Lax, and lasts 30 days. It is Secure when `SESSION_COOKIE_SECURE=true`.
2. Send that cookie on every later request.
3. `POST /api/v1/auth/logout` ends the session on the server.

Any `/api/**` call without a valid session answers **401**, except:

- `/api/v1/health`;
- `GET` and `POST /api/v1/setup`;
- `POST /api/v1/auth/login` and `POST /api/v1/auth/logout`;
- `GET /api/v1/invites/{token}` and `POST /api/v1/invites/{token}/accept`;
- the Swagger pages.

Admin-only calls answer **403** to a USER. A deactivated user's sessions end at once.

There is no CSRF token. The API is JSON-only on a single origin, and the cookie is SameSite=Lax.

```sh
# Log in with curl and keep the cookie in a jar.
curl -c jar -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"…"}' http://localhost:8080/api/v1/auth/login
curl -b jar http://localhost:8080/api/v1/videos?kind=MOVIE
```

### Errors

Errors use RFC 9457 problem details (`application/problem+json`), with a readable `detail`:

```json
{ "type": "about:blank", "title": "Invalid request", "status": 400, "detail": "Files can be at most 20 GB" }
```

Validation failures are 400. A missing resource, or one you may not see, is 404. A request that clashes with the current state is 409, for example completing an upload twice.

### Paging

Library lists (tracks, albums, artists, favorites, videos, shows):

- return **everything** when `limit` and `offset` are left out;
- with them, return one page of `limit` items (1–1000), starting at `offset`;
- always carry the full count in the **`X-Total-Count`** header;
- sort with a stable tie-break, so pages never overlap or skip.

Short lists (history, most played, recent and continue-watching videos) take only `limit`: default 50, at most 200.

### Media responses

Streams, covers, thumbnails and subtitles are proxied from the private object store. They are never redirects to it.

- They need a session like everything else.
- They are sent with `Cache-Control: private, max-age=86400`, because the bytes behind an id never change.
- Streams accept **one** byte range (`Range: bytes=start-end`, `bytes=start-` or `bytes=-suffix`) and answer **206** with `Content-Range` (ADR 0006).
- A malformed range, or one with several parts, is ignored, and the whole file is sent with **200**.
- A range that starts past the end answers **416**.

## Endpoints

"Admin" means the call needs the ADMIN role. Everything else needs any signed-in user, unless it says "public".

### System and setup

| Call | What it does |
| --- | --- |
| `GET /health` | Public. `{status, database}`, both `UP` or `DOWN`. |
| `GET /setup` | Public. `{setupRequired}`, true only while no user exists. |
| `POST /setup` | Public, once. Creates the first admin and logs in. Answers 409 after that. |

### Auth and users

| Call | What it does |
| --- | --- |
| `POST /auth/login` | Logs in and sets the cookie. A wrong username and a wrong password look the same (401). |
| `POST /auth/logout` | Ends the session. Idempotent. |
| `GET /auth/me` | The signed-in user: `{id, username, role}`. |
| `POST /auth/password` | Changes your password (12–128 characters). Ends your other sessions. |
| `GET /users` | Admin. All users, oldest first. |
| `POST /users` | Admin. Invites someone: creates a pending account and returns a one-time `token` for `/invite/{token}`. |
| `POST /users/{id}/invite` | Admin. A fresh link for a pending user. Earlier links stop working. |
| `POST /users/{id}/deactivate`, `/activate` | Admin. Revokes or restores access. You cannot deactivate yourself. |
| `GET /invites/{token}` | Public. The username behind a usable invite. Used, expired and unknown tokens all answer 404. |
| `POST /invites/{token}/accept` | Public, once. Sets the password and logs in. |

### Uploads

Files go straight from the client to the object store (ADR 0005). The API never receives the bytes.

1. **Start.** `POST /uploads` with `{filename, sizeBytes, license?}`. The **kind** comes from the extension:
   - AUDIO is everything else, up to 250 MB;
   - VIDEO is `.mp4`, `.m4v`, `.mov`, `.webm` or `.mkv`, up to 20 GB.

   The answer is an `UploadTicket`: the `upload`, `partSizeBytes` (16 MiB), `partCount`, and presigned URLs for the first 200 `parts`.
2. **Send the parts.** `PUT` each 16 MiB slice of the file to its part URL. Keep each response's `ETag`.

   An upload with more than 200 parts gets the rest from `GET /uploads/{id}/parts?from=201`, up to 200 at a time; a 20 GB video has about 1,280. This call answers 409 once the upload is no longer in progress.
3. **Complete.** `POST /uploads/{id}/complete` with `{parts: [{partNumber, etag}, …]}`. It answers 202 and queues ingest.
4. **Watch the status.** Poll `GET /uploads/{id}`, or `GET /uploads` for all of yours, newest first.

| Status | Meaning |
| --- | --- |
| `UPLOADING` | Parts are still being sent. |
| `INGESTING` | Being read, checked and added. A multi-GB video is read in full to hash it, so this can take minutes. |
| `DONE` | Added. `trackId` or `videoId` says where. |
| `DUPLICATE` | The same bytes are already in the library. `trackId` or `videoId` points at the copy that was already there. |
| `FAILED` | `error` is a readable reason, such as "No video stream found". `POST /uploads/{id}/retry` queues it again. |

`GET /admin/ingest-failures` (admin) lists failed uploads from every user.

### Music library

| Call | What it does |
| --- | --- |
| `GET /tracks` | Paged. `sort=added` (default, newest first), `title` or `artist`. `genre=<slug>` filters. |
| `GET /tracks/{id}/stream` | The audio file as stored, with range support. |
| `GET /albums` | Paged. Same `sort` values as tracks. |
| `GET /albums/{id}` | The album, who uploaded it and its tracks. |
| `GET /albums/{id}/cover` | The cover image, or 404. |
| `GET /albums/recent?limit=12` | Albums by their newest track (at most 50). |
| `GET /albums/featured` | The newest album with a cover, or 204 when none has one. |
| `GET /artists`, `GET /artists/{id}` | Paged, A to Z. One artist with their albums and every track. |
| `GET /genres` | Genres from track tags, most tracks first. Use `slug` in links. |
| `GET /search?q=&limit=8` | Tracks, albums and artists, typo-tolerant, grouped best first, with `top` naming the best match overall. Music only for now. |

### Plays, history and likes

| Call | What it does |
| --- | --- |
| `POST /events/playback` | Reports a `play_started`, `play_completed` or `skipped` event (ADR 0008). Idempotent by the client-chosen `eventId`. |
| `GET /history` | Your qualifying plays, newest first. A track played twice appears twice. |
| `GET /history/most-played` | Your plays counted per track, highest first. |
| `GET /favorites` | Paged. Your liked tracks, most recently liked first. |
| `GET /favorites/ids` | The ids of every track you like. Cheap to fetch and keep. |
| `PUT /favorites/{trackId}`, `DELETE /favorites/{trackId}` | Like and unlike. Both are idempotent. |

### Videos (spec 03)

Videos are movies or episodes. Episodes belong to a show and carry `season` and `episode` numbers.

Each `Video` describes the file as ingest found it:

- duration, resolution, codecs and container;
- `playable`, which is false when a browser may not play the file as stored. MKV is always false; so are codecs outside the browser-safe list in spec 03;
- `thumbnailUrl`;
- your own `progress`, when you have started it.

| Call | What it does |
| --- | --- |
| `GET /videos?kind=MOVIE` | Paged. `kind=MOVIE` (default) or `EPISODE`; `sort=added` (default), `title` or `year`. |
| `GET /videos/recent` | The newest movies and episodes. |
| `GET /videos/continue-watching` | Your unfinished videos, most recent first. A show appears once, as its latest episode. |
| `GET /videos/{id}` | `{video, subtitles, upNext, canEdit}`. `upNext` lists the rest of the season and then the next season for an episode, and other movies for a movie. |
| `PATCH /videos/{id}` | The uploader or an admin (others get 403). Corrects `kind`, `title`, `year`, `showName`, `season` and `episode`. An episode needs all three show fields. Naming a new show creates it; a show left empty is removed. |
| `GET /videos/{id}/stream` | The video file as stored, with range support. There is no transcoding (ADR 0010). |
| `GET /videos/{id}/thumbnail` | The frame taken at ingest, 10% into the video, or 404. |
| `GET /videos/{id}/subtitles/{index}` | One subtitle track as `text/vtt`. The list is in `GET /videos/{id}`. |
| `POST /videos/{id}/subtitles` | Multipart form with a `file` (`.srt` or `.vtt`, at most 2 MB) and an optional `language`. SRT is converted to WebVTT. The language is guessed from names like `Film.en.srt`. |
| `PUT /videos/{id}/progress` | `{positionMs, durationMs}`. Last write wins. Marks the video watched past 90%, or with under 2 minutes left. |
| `GET /shows` | Paged. `sort=added` (by newest episode, the default), `title` or `year`. |
| `GET /shows/{id}` | The show, its seasons with episodes in order, and `resume`: the episode to play next for you. |

How a video upload becomes a movie or an episode:

- **Container.** It is detected from the bytes, not the extension.
- **Probe.** `ffprobe` reads the file through an internal URL.
- **Duplicates.** A SHA-256 of the whole file finds them.
- **Thumbnail and subtitles.** One frame becomes the thumbnail. Embedded text subtitles (SRT, ASS/SSA, mov_text, WebVTT) are kept as WebVTT. Image subtitles are skipped.
- **Names.** The filename decides the rest:
  - `Show.Name.S01E02…` or `Show Name 1x02` makes an episode;
  - `Title (2019)` makes a movie from 2019;
  - anything else makes a movie titled from the filename.

  A wrong guess is fixed with `PATCH`.

## Changing the API

1. Edit `contract/openapi.yaml` first.
2. Run `pnpm gen:api` in `web/` to regenerate the typed client, and commit `schema.d.ts`.
3. Implement it in the backend.

`OpenApiContractTest` fails while the running backend's operations or schema properties differ from the contract. An operation marked `x-ossm-planned: true` is skipped until it is served. CI also runs `pnpm check:api`, which fails when `schema.d.ts` is stale.
