# Spec 01: OSSM Phase 1 - core self-hosted music app (library, streaming, playlists, web UI)

Status: ready-for-agent

## Problem Statement

I want to listen to my own music collection through a modern, polished web app that I host myself, shared with a few people I trust, without depending on a streaming service. Existing self-hosted options are either hard to install, visually dated, or depend on scraping third parties. Separately, as a developer building a portfolio, I need a finished, demoable, well-engineered project that shows backend depth (streaming, async ingestion, object storage), full-stack polish, and a foundation that can later grow into an event-driven data platform (Kafka, ClickHouse) without rework.

## Solution

**OSSM (Open Source Streaming Music)** Phase 1 is a self-hosted web app. An admin sets up the instance, creates accounts for other people, and everyone uploads music files from the browser into one shared library. Uploaded files are stored as objects in an S3-compatible store; an asynchronous ingest job reads tags, extracts cover art, computes a dominant color, deduplicates by content hash, and adds the tracks to the library. Users browse an Explore page built from their own library, search, play music through a persistent player with a queue, and keep per-user playlists, favorites and listening history. Every play emits a well-defined playback event, stored in Postgres behind a publisher interface, so Phase 2 can route the same events to Kafka and ClickHouse without changing the producers.

The UI follows `DESIGN.md` (light-default, Deezer-inspired Explore tiles, Amp Orange accent, open metadata badges), scoped to Phase 1 per its Section 10.

## User Stories

### Instance setup and accounts
1. As the person installing OSSM, I want a first-run setup screen that creates the admin account, so that I can claim the instance without editing config files.
2. As the admin, I want the setup screen to disappear once an admin exists, so that strangers cannot take over my instance.
3. As the admin, I want to create user accounts (or invite links), so that only people I choose can use my library.
4. As the admin, I want to deactivate a user, so that I can revoke access without deleting their playlists immediately.
5. As the admin, I want to see a list of users and their roles, so that I know who has access.
6. As an invited user, I want to set my own password through my invite, so that the admin never knows it.
7. As a user, I want to log in with my username and password and stay logged in across browser restarts, so that I can resume listening quickly.
8. As a user, I want to log out, so that nobody else on a shared device can use my account.
9. As a user, I want to change my password, so that I can keep my account secure.
10. As a user, I want my session to survive a server restart, so that I'm not logged out by routine maintenance.
11. As a user, I want passwords stored with a strong hash, so that a database leak does not expose them.
12. As a security-conscious admin, I want no open self-registration, so that the instance stays private.
13. As a user, I want to choose light, dark or system theme in settings, so that the app matches my environment.

### Uploading and ingest
14. As a user, I want to drag and drop multiple audio files onto an upload zone, so that adding music is fast.
15. As a user, I want to see per-file upload progress, so that I know large files are still transferring.
16. As a user, I want files to upload directly to storage, so that big uploads don't tie up the API.
17. As a user, I want an "ingesting" state after the upload completes, so that I know the file is being processed.
18. As a user, I want a failed ingest to show a readable reason and a retry action, so that I can recover without re-uploading everything.
19. As a user, I want unsupported or corrupt files rejected with a clear message, so that junk does not enter the library.
20. As a user, I want only real audio (MP3, FLAC, M4A/AAC, OGG/Opus, WAV) accepted, verified by file content rather than extension, so that renamed files cannot slip in.
21. As a user, I want a file larger than 250 MB rejected before upload begins, so that I don't waste time.
22. As a user, I want uploading the same file twice to be recognized and skipped, so that my library has no duplicates.
23. As a user, I want title, artist, album, track number, year and genre read from the file's tags, so that I do not retype metadata.
24. As a user, I want missing tags to fall back to sensible values (filename as title, "Unknown Artist"), so that every track is still playable and findable.
25. As a user, I want embedded cover art extracted and stored, so that albums look right in the UI.
26. As a user, I want a dominant color computed from each album's cover at ingest, so that album pages get a matching header wash without flicker.
27. As a user, I want the codec, bitrate and duration recorded, so that I can see a quality badge on tracks.
28. As a user, I want to optionally set a license on a track when I upload it (default "All rights reserved"), so that open-licensed music is labeled correctly.
29. As a user, I want ingest to survive a server restart and retry automatically on transient failures, so that uploads are never silently lost.
30. As an admin, I want to see ingest failures, so that I can diagnose problems with the object store or bad files.

### Library browsing and Explore
31. As a user, I want a Home/Explore page built from my own library, so that I can discover what's in it.
32. As a user, I want a "Genres & moods" grid of colored tiles generated from my genre tags, so that I can browse by category.
33. As a user, I want each genre to keep the same color everywhere, so that colors help me navigate.
34. As a user, I want a "Recently added" carousel, so that new uploads are easy to find.
35. As a user, I want a "Most played" carousel, so that my favorites surface.
36. As a user, I want a featured banner from my library, so that the page feels alive.
37. As a user, I want Tracks, Albums and Artists tabs in my library, so that I can browse however I think about music.
38. As a user, I want long lists to scroll smoothly even with thousands of tracks, so that the app stays fast.
39. As a user, I want an album page with cover, metadata, a header tinted by the cover color, and a track list, so that I can play an album.
40. As a user, I want an artist page with their albums and tracks, so that I can explore an artist.
41. As a user, I want to see the quality badge, license chip and "Uploaded by @user · date" line on album and track detail, so that I know what I'm playing.
42. As a user, I want clicking a license chip to explain the license, so that I understand its terms.
43. As a user, I want empty-state screens that guide me to upload, so that a new instance is not a dead end.
44. As a user, I want skeleton loaders instead of spinners, so that pages feel fast.

### Search
45. As a user, I want a single search box reachable from anywhere (Cmd/Ctrl+K or "/"), so that finding music is instant.
46. As a user, I want results grouped into tracks, albums and artists, so that I can scan them quickly.
47. As a user, I want search to tolerate typos and partial words, so that I find things without exact spelling.
48. As a user, I want a top result highlighted, so that the most likely match is one click away.
49. As a user, I want search to be debounced, so that typing does not hammer the server.

### Playback and queue
50. As a user, I want music to keep playing while I navigate, so that browsing never interrupts listening.
51. As a user, I want play/pause, next, previous, seek, volume, shuffle and repeat (off/all/one), so that I control playback fully.
52. As a user, I want to see elapsed and remaining time and a seek bar, so that I know where I am in a track.
53. As a user, I want the next track preloaded so transitions are nearly gapless, so that albums play smoothly.
54. As a user, I want a queue drawer where I can reorder, remove, "play next" and "add to queue", so that I shape what plays.
55. As a user, I want my queue and position restored after a reload (paused), so that a refresh does not lose my place.
56. As a user, I want OS media keys and lock-screen controls with artwork, so that I can control playback without the tab.
57. As a user, I want keyboard shortcuts (Space, arrows to seek, Shift+arrows for previous/next, M mute, L like, "/" search) and a help dialog, so that I can drive the player from the keyboard.
58. As a user, I want playback to work with seeking inside large FLAC files, so that I can jump around without re-downloading.
59. As a user, I want only authenticated users to be able to stream audio, so that my library is private.
60. As a mobile user, I want a mini-player that expands to a full-screen player, so that playback works well on a phone.
61. As a user, I want the full-screen player to use a dark theme with a blurred cover backdrop, so that it feels immersive.

### Playlists, favorites, history
62. As a user, I want to create, rename and delete playlists, so that I can organize music.
63. As a user, I want to add tracks to a playlist from anywhere (track rows, album pages, queue), so that building playlists is frictionless.
64. As a user, I want to drag to reorder tracks within a playlist, so that I control the order.
65. As a user, I want playlists to be private by default, so that my organization is my own.
66. As a user, I want to optionally make a playlist visible to everyone on the instance, so that I can share with the people I trust.
67. As a user, I want to like and unlike tracks with one click, so that I can mark favorites.
68. As a user, I want a Liked page, so that I can replay favorites.
69. As a user, I want a History page of what I recently played, so that I can return to something I heard earlier.
70. As a user, I want my playlists listed in the sidebar with thumbnails, so that I can jump to them fast.

### Playback events (foundation for Phase 2)
71. As a future analytics consumer, I want a `play_started`, `play_completed` and `skipped` event emitted for each listen, so that stats can be computed later.
72. As a future analytics consumer, I want a "play" to count only at 30 seconds or 50% of the track, whichever comes first, so that stats are meaningful.
73. As a future analytics consumer, I want every event to have a unique id, user id, track id, type, timestamp, playback position and client identifier, so that events can be deduplicated and attributed.
74. As a future analytics consumer, I want events stored durably in Postgres behind an `EventPublisher` interface, so that switching to Kafka needs only a new adapter.
75. As a user, I want my History and Most played to be derived from these events, so that everything is consistent.

### Operations and demo
76. As the operator, I want to run the whole stack with one compose command, so that installing is trivial.
77. As the operator, I want a reverse proxy in front so that the browser sees a single origin with HTTPS, so that cookies and security are simple.
78. As the operator, I want health endpoints and structured JSON logs, so that I can monitor and debug the system.
79. As a recruiter or visitor, I want a hosted demo with seeded open-licensed music that resets daily, so that I can try the app without installing anything.
80. As a developer, I want the OpenAPI spec to be the source of truth and a typed client generated from it, so that the frontend and backend cannot drift.
81. As a developer, I want the UI to run standalone against a mock of the API, so that frontend work doesn't block on the backend.
82. As a developer, I want CI to verify build, tests, lint, the OpenAPI spec against the running app, and the Docker image build, so that the main branch is always healthy.

## Implementation Decisions

**Product and scope**
- Name: OSSM, expanded as "Open Source Streaming Music". License: MIT. Public GitHub repository.
- Self-hosted, single instance, multiple users. Music source is the user's own uploaded files only. No external providers, no scraping.
- One **shared library** per instance. Playlists, favorites and history are per-user. Playlists are private by default with an optional "visible to everyone on this instance" flag.
- Phasing: Phase 1 = this spec. Phase 2 = outbox, Kafka (JSON envelope), ClickHouse and user stats, plus a synthetic listener generator. Phase 3 = data platform (Parquet archive in the object store, dbt models and tests, one scheduled job, replay runbook). Phase 4 = observability and hardening, including migrating JSON events to Avro with Schema Registry. Phase 5 = AI features (to be brainstormed). This spec covers only Phase 1; design choices must not block later phases.

**Backend**
- Spring Boot on the latest Java LTS with virtual threads, Spring MVC (not WebFlux), Gradle build, Spring Data JPA (native queries where performance warrants), Flyway migrations, Spring Session on JDBC.
- Modular monolith with package-level boundaries (Spring Modulith-style): users/auth, library, ingest, playback/streaming, playlists, search, events. Modules talk through explicit interfaces.
- Postgres is the system of record. Search uses Postgres full-text search plus `pg_trgm`, exposed as one search endpoint returning tracks, albums and artists.
- Object storage: an S3-compatible store accessed only through the AWS SDK v2 S3 client with a configurable endpoint. SeaweedFS is the reference deployment (MinIO's community edition is no longer maintained). A short spike must verify multipart upload, presigned URLs and range reads against SeaweedFS before building on it. Audio files and cover art live in the store; Postgres holds object keys and metadata.
- Upload flow: client requests a presigned multipart upload from the API, uploads directly to the store, then calls "upload complete", which enqueues an ingest job.
- Ingest jobs run on a persistent Postgres-backed scheduler (db-scheduler) behind an `IngestQueue` port with retries and restart safety. The job: verifies content type by sniffing; reads tags and technical properties on the JVM (no ffmpeg); computes SHA-256 for dedupe; extracts cover art and stores it; computes the album's dominant color; writes normalized artist, album and track rows. Job and file status are queryable so the UI can show ingesting / failed / done with a readable reason.
- Data model: normalized `artist`, `album`, `track` built from tags. Multi-artist tracks are a single artist string in v1. Missing tags fall back to the filename and "Unknown Artist". Tracks store content hash, object key, codec, bitrate, duration, optional license (default "All rights reserved"), uploader and created time. Albums store cover key and dominant color.
- Allowed formats: MP3, FLAC, M4A/AAC, OGG/Opus, WAV. Max 250 MB per file. No per-user quota.
- Streaming: the API proxies audio from the object store with authentication on every request and full HTTP range support (seeking), passing ranges through to the store. Direct play only; no transcoding. The object store is never exposed publicly.
- Auth: first-run admin setup (only when no users exist), admin-created users or invite links, argon2id password hashing, HttpOnly cookie sessions stored in Postgres, two roles (admin, user), no open self-registration. Cookie auth assumes a single origin behind the reverse proxy.
- Playback events: the client reports `play_started`, `play_completed` and `skipped`. A "play" counts at 30 seconds or 50% of the track. Events are an immutable, versioned envelope with event id, user id, track id, type, timestamp, position in milliseconds and client identifier. They flow through an `EventPublisher` port; the Phase 1 adapter writes to a Postgres `play_event` table, which also powers History and Most played. The schema and envelope version must be designed so Phase 2 can add a transactional-outbox relay to Kafka without changing producers.
- Errors use RFC 9457 problem details. Health endpoints and structured JSON logs via Spring Actuator.

**API contract**
- REST. The OpenAPI spec is authored first and is the source of truth for both sides; springdoc generates the spec from the running app and CI checks for drift against the committed contract. A typed TypeScript client is generated from it.
- Endpoint groups: setup/auth/sessions, users (admin), uploads and ingest status, library (tracks/albums/artists/genres, recently added, most played, featured), search, streaming and cover art, playlists, favorites, history, playback events.

**Frontend**
- Next.js (App Router, TypeScript strict), served by its own container behind the reverse proxy (SSR available). Tailwind CSS with shadcn/ui/Radix primitives restyled to DESIGN.md tokens, TanStack Query for server state, Zustand for player and queue state, dnd-kit for playlist reordering, TanStack Virtual for long lists.
- UI is built first against an MSW mock of the OpenAPI contract, then pointed at the real backend; all calls go through the generated client so the mock can be dropped.
- Visual design follows `DESIGN.md` with its Section 10 scope mapping: Explore page from the user's library (genre tiles from tags with deterministic colors, Recently added, Most played, featured banner), no podcasts/radio/community/follow/download/lyrics/devices, open metadata (quality badge, license chip, uploader line), artwork-derived header wash from the stored dominant color, light default with dark theme and dark full-screen player.
- Screens: first-run setup, login, Home/Explore, Library (Tracks/Albums/Artists), Album, Artist, Search (Cmd/Ctrl+K), Playlists (list, detail, create/rename/delete, reorder, visibility toggle), Liked, History, Upload, Admin (users), Settings (password, theme).
- Player: persistent bottom bar in the root layout; queue drawer; next-track preloading in a second audio element for near-gapless transitions; Media Session API; keyboard shortcuts and help dialog; queue and position persisted to localStorage and restored paused on reload; mobile mini-player expanding to full-screen.
- English-only UI. Bangla content/UI support is deferred.

**Repo, deployment and CI**
- Monorepo with separate backend, web, deploy and docs areas. Domain glossary in `CONTEXT.md` and ADRs in `docs/adr/` are created lazily as decisions are made.
- Compose stack for Phase 1: reverse proxy (Caddy, automatic HTTPS), web, api, postgres, and the S3-compatible store.
- Hosted demo on a small VPS running the compose stack, seeded with CC-licensed or public-domain tracks and reset daily. The Kafka/ClickHouse stack will be a separate compose profile in Phase 2.
- CI (GitHub Actions): backend build and tests, formatting and lint, web typecheck/lint/unit tests, OpenAPI drift check, Docker image build.

## Testing Decisions

- **What makes a good test:** exercise external behavior only (HTTP responses, emitted events, stored objects, rendered UI behavior), never internal method calls or private structure. Tests should survive refactors and read like user stories.
- **Backend seam (one seam):** the HTTP API plus the playback-event contract. Integration tests run against real Postgres and a real S3-compatible store via Testcontainers; the database and object store are never mocked. Cover: setup and auth flows, upload → ingest → library visibility, dedupe, unsupported/oversized files, range-request streaming and authorization, search (including typo tolerance), playlists/favorites/history permissions, and that each qualifying play produces exactly the specified event. A small number of pure unit tests are acceptable for algorithms with no I/O (tag fallback rules, play-threshold logic, dominant-color computation).
- **Frontend seam:** component and store tests with Vitest and Testing Library for the player and queue logic (next/previous, shuffle, repeat, persistence and restore, event emission thresholds), playlist reordering, and upload state transitions, using the MSW mock.
- **End-to-end (optional stretch):** one Playwright smoke test (set up admin, log in, upload, play) against the compose stack. Not required for Phase 1 to be considered done.
- **Contract test:** CI verifies the running backend conforms to the committed OpenAPI spec.
- **Prior art:** none; this is a greenfield repository. The first backend integration test and the first player test establish the conventions for the rest.

## Out of Scope

- Kafka, Schema Registry, ClickHouse, stats pages, yearly recap, synthetic listener generator, Parquet archive, dbt, orchestrated jobs, Prometheus/Grafana, and AI features (Phases 2–5).
- Transcoding or ffmpeg, federation, native mobile apps, external music sources or scraping, podcasts, radio/live, Spotify or Apple import, lyrics, follow, download/offline, device selection, OpenSubsonic, collaborative or smart playlists, multi-artist relations, private per-user libraries, per-user quotas, open self-registration.
- Bangla content support, UI internationalization.
- Admin instance-wide stats dashboard.
- Importing an existing bucket or prefix into the library.

## Further Notes

- **Object store risk:** MinIO's community edition is archived and no longer distributed; keep the S3 layer vendor-neutral and treat SeaweedFS as the reference. If the spike shows SeaweedFS gaps, Garage or another S3-compatible store can replace it by configuration.
- **DESIGN.md** in the repository root is the visual source of truth; its Section 10 defines what to build, adapt or drop for Phase 1.
- **Quality bar for the portfolio goal:** prioritize a finished, well-tested, well-documented Phase 1 over breadth. README, architecture notes and screenshots or a demo video are part of "done".
- **Demo licensing:** seed only CC-BY, CC0 or public-domain music, and show the license chip on it.

