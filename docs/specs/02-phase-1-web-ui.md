# Spec 02: OSSM Phase 1 web UI (built first against a mocked API)

Status: ready-for-agent

Frontend slice of spec 01 (Phase 1). The backend is built separately to the same API contract. Visual source of truth: `DESIGN.md` (Section 10 overrides everything above it). A ready-to-use build prompt is in `docs/prompts/phase-1-ui.md`.

## Problem Statement

I can't demo or validate OSSM without a polished interface, and the Spring backend does not exist yet. I want to build the whole Phase 1 web experience now, in a way that forces the API contract to be designed up front, and that runs standalone so nothing blocks on the backend. As a portfolio piece, the UI has to feel like a commercial music app (persistent player, fast lists, good empty and loading states) while staying honest to a self-hosted library of the user's own files.

## Solution

A Next.js web app that implements every Phase 1 screen against a hand-authored OpenAPI contract, served by an MSW mock seeded with realistic data. Users set up the instance, log in, upload music, browse an Explore page generated from their own library, search, and play through a persistent player with a queue, while managing playlists, favorites and history. The app follows `DESIGN.md` (light default, dark supported, colored genre tiles, Amp Orange primary accent, open-metadata badges). When the real backend arrives, the mock is dropped and the same generated client talks to the real API.

## User Stories

### Setup, auth, account
1. As a first-time installer, I want a setup screen that creates the admin, so that I can claim my instance.
2. As an admin, I want the setup screen to never appear again once an admin exists, so that nobody can hijack the instance.
3. As a user, I want a login screen with clear errors for wrong credentials, so that I know what to fix.
4. As a user, I want to be redirected to login when my session expires, and returned to where I was afterward, so that expiry is painless.
5. As a user, I want to log out from the account menu, so that I can secure a shared device.
6. As a user, I want to change my password in settings, so that I can keep my account secure.
7. As a user, I want to choose light, dark or system theme and have it remembered, so that the app matches my environment.
8. As an invited user, I want a page to set my password from an invite link, so that I can join without the admin knowing my password.
9. As an admin, I want a user list with roles and status, so that I know who has access.
10. As an admin, I want to create a user or generate an invite link, so that I can add people.
11. As an admin, I want to deactivate a user, so that I can revoke access.
12. As a non-admin, I want admin pages hidden and inaccessible, so that I can't reach things I shouldn't.

### App shell and navigation
13. As a desktop user, I want a persistent sidebar with navigation and my playlists (40px thumbnails), so that I can move around quickly.
14. As a desktop user, I want a sticky top bar with back/forward, search and an account menu, so that core actions are always reachable.
15. As a mobile user, I want a bottom tab bar (Home, Explore, Search, Library) instead of a sidebar, so that navigation fits my thumb.
16. As a user, I want content to never hide behind the player bar, so that everything stays reachable.
17. As a user, I want skeleton loaders instead of spinners, so that pages feel fast.
18. As a new user with an empty library, I want empty states that guide me to upload, so that I'm never stuck on a blank screen.
19. As a user, I want helpful error screens for 401, 404 and 500 responses, so that failures are understandable.

### Explore and browsing
20. As a user, I want an Explore page with a featured banner from my library, so that the app feels alive.
21. As a user, I want "Genres & moods" tiles generated from my genre tags, so that I can browse by category.
22. As a user, I want each genre to always have the same tile color (deterministic), so that color aids navigation.
23. As a user, I want a "Recently added" carousel and a "Most played" carousel, so that new and favorite music surface.
24. As a user, I want carousels with snap scrolling and arrow buttons on desktop, so that browsing is comfortable.
25. As a user, I want Tracks, Albums and Artists tabs in my library, so that I can browse how I think about music.
26. As a user, I want long lists virtualized, so that thousands of tracks scroll smoothly.
27. As a user, I want an album page with a header tinted from the cover's stored dominant color, so that the page matches the artwork.
28. As a user, I want white header text to remain readable on any cover color, so that contrast is always good.
29. As a user, I want a large Amp Orange play button and a shuffle button on album and playlist pages, so that starting playback is obvious.
30. As a user, I want to see the quality badge, license chip and "Uploaded by @user · date" line on album and track detail, so that I know what I'm playing.
31. As a user, I want clicking a license chip to open an explanation popover, so that I understand the license.
32. As a user, I want the currently playing track highlighted with an animated equalizer in track lists, so that I can see what's playing.
33. As a user, I want an artist page showing their albums and tracks, so that I can explore an artist.
34. As a user, I want track-row actions (like, add to playlist, more) on hover/focus on desktop and always visible on touch, so that actions work on every device.

### Search
35. As a user, I want a single search field opened from anywhere with Cmd/Ctrl+K or "/", so that search is instant.
36. As a user, I want results debounced and grouped into top result, tracks, albums and artists, so that I can scan quickly.
37. As a user, I want a clear empty state when nothing matches, so that I know the search worked.
38. As a user, I want to clear the search with one click or Escape, so that I can start over.

### Upload and ingest
39. As a user, I want to drag and drop multiple files onto an upload zone (or pick them with a button), so that adding music is easy.
40. As a user, I want instant client-side rejection of unsupported formats and files over 250 MB with a clear message, so that I don't waste time.
41. As a user, I want per-file upload progress, so that I know large files are moving.
42. As a user, I want an "ingesting" state after upload that updates automatically to done or failed, so that I know when the track is ready.
43. As a user, I want a failed ingest to show a readable reason and a retry action, so that I can recover without re-uploading everything.
44. As a user, I want to optionally set a license per file before uploading (default "All rights reserved"), so that open-licensed music is labeled correctly.
45. As a screen-reader user, I want ingest status and toasts announced, so that I'm informed without looking.

### Player and queue
46. As a user, I want a persistent player bar so that navigating never interrupts playback.
47. As a user, I want play/pause, previous/next, seek bar, volume, shuffle and repeat (off/all/one), so that I control playback fully.
48. As a user, I want elapsed and remaining time in tabular mono, so that numbers don't jitter.
49. As a user, I want the next track preloaded for near-gapless transitions, so that albums flow.
50. As a user, I want a queue drawer with reorder, remove, "play next" and "add to queue", so that I shape what plays.
51. As a user, I want my queue and position restored after a reload (paused), so that a refresh doesn't lose my place.
52. As a user, I want OS media keys, lock-screen metadata and artwork via Media Session, so that I can control playback without the tab.
53. As a user, I want keyboard shortcuts (Space, arrows seek 5s, Shift+arrows previous/next, M mute, L like, "/" search) and a "?" help dialog, so that I can drive the player from the keyboard.
54. As a mobile user, I want a 64px mini-player that expands into a full-screen player (swipe down to dismiss), so that playback is comfortable on a phone.
55. As a user, I want the full-screen player always dark with a blurred cover backdrop, so that it feels immersive.
56. As a user, I want seeking to work smoothly in long tracks, so that I can jump around.
57. As a user, I want playback to recover gracefully from a stream error (toast, skip to next), so that one bad file doesn't stop the session.

### Playlists, favorites, history
58. As a user, I want to create, rename and delete playlists, so that I can organize music.
59. As a user, I want to add tracks to a playlist from track rows, album pages and the queue, so that building playlists is frictionless.
60. As a user, I want to drag to reorder tracks in a playlist (with a keyboard-accessible alternative), so that I control order.
61. As a user, I want playlists private by default and a toggle to make one visible to everyone on the instance, so that I control sharing.
62. As a user, I want to like and unlike tracks from anywhere with a satisfying toggle animation, so that marking favorites is quick.
63. As a user, I want Liked and History pages, so that I can return to favorites and recent listens.

### Playback events
64. As a future analytics consumer, I want `play_started`, `play_completed` and `skipped` events sent to the API, so that stats can be built later.
65. As a future analytics consumer, I want a "play" counted only at 30 seconds or 50% of the track, whichever comes first, so that stats are meaningful.
66. As a future analytics consumer, I want every event to carry a unique id, track id, type, timestamp, position in ms and a client identifier, so that events can be deduplicated and attributed.

### Design quality and accessibility
67. As a user, I want the UI to follow the DESIGN.md tokens exactly (colors, type, radii, elevation, motion), so that it feels cohesive.
68. As a user who prefers reduced motion, I want tile rotation, shimmer and scale effects disabled, so that the app is comfortable.
69. As a keyboard user, I want all menus, dialogs and the queue fully keyboard navigable with visible focus, so that I don't need a mouse.
70. As a low-vision user, I want AA contrast throughout, including text over artwork on a scrim, so that everything is readable.
71. As a touch user, I want targets of at least 44px and alternatives to hover-only actions, so that the app is usable on a phone.
72. As a developer, I want the UI to run standalone against the mock with `pnpm dev`, so that I can work without a backend.
73. As a backend engineer, I want a complete OpenAPI spec, so that I can implement the API without guessing.
74. As a developer, I want a typed client generated from the spec and used for every request, so that frontend and backend cannot drift.

## Implementation Decisions

**Stack and structure**
- Next.js App Router, TypeScript strict, React, pnpm; runs as its own server (SSR available) behind the reverse proxy, same origin as the API.
- Tailwind CSS with DESIGN.md tokens exposed as CSS custom properties and mapped into the Tailwind config as in DESIGN.md Section 9; shadcn/ui (Radix) primitives restyled to the tokens; lucide-react icons.
- TanStack Query for server state, Zustand for player and queue state, dnd-kit for playlist reordering, TanStack Virtual for long lists.
- Fonts via Next font loading: Plus Jakarta Sans, Inter, JetBrains Mono. English-only UI; no Bangla fonts or i18n.
- Lives in the monorepo's `web` area alongside `backend`, `deploy` and `docs`.

**Contract-first API**
- Hand-author an OpenAPI 3.1 spec as the source of truth, in a shared contract location the backend will later build to. Endpoint groups: setup/auth/sessions, users (admin), uploads and ingest status, library (tracks, albums, artists, genres, recently added, most played, featured), search, audio streaming and cover art, playlists, favorites, history, playback events. Errors use RFC 9457 problem details.
- Generate a typed TypeScript client (openapi-typescript or Orval). All network calls go through it; no hand-written fetches.
- MSW mocks the API for the dev server and tests, seeded with realistic data: about 200 tracks, 30 albums, 20 artists, a spread of genres, cover art, quality values (MP3 320, FLAC, OPUS 160), licenses (mostly "All rights reserved", some CC BY and CC0) and two users. The mock includes failure cases: an ingest that fails with a readable reason, an unsupported file, a 401, and a 500.
- Auth is an HttpOnly cookie session; the UI never reads or stores tokens.

**Screens (Phase 1 scope)**
- First-run setup, login, invite acceptance, Home/Explore, Library (Tracks/Albums/Artists), Album, Artist, Search (palette plus results), Playlists (list and detail), Liked, History, Upload, Admin (users), Settings.
- Explore follows DESIGN.md Section 10: optional All/Music chips, featured banner from the library, genre tiles with deterministic colors (hash of genre slug), "Recently added", "Most played".
- Album/track detail shows the open-metadata line: quality badge (from codec and bitrate), license chip with explanatory popover, and "Uploaded by @user · date". Header wash uses the album's stored dominant color with lightness clamped for contrast.

**Player**
- Fixed bottom bar in the root layout; mobile 64px mini-player expanding to a full-screen dark player with swipe-to-dismiss, plus bottom tab bar.
- Queue drawer with reorder, remove, play next, add to queue. Near-gapless transitions by preloading the next track in a second audio element. Media Session API. Keyboard shortcuts with a help dialog. Queue and position persisted to localStorage and restored paused on reload.
- Audio comes from an authenticated same-origin stream URL from the API (the API proxies with range support); the UI never uses an object-store URL.
- Playback events (`play_started`, `play_completed`, `skipped`) are produced by one isolated, testable module. A "play" counts at 30 seconds or 50%, whichever comes first. Each event carries event id (uuid), track id, type, timestamp, position in ms and client identifier.

**Upload**
- Drag-and-drop multi-file zone. Direct presigned multipart upload with per-file progress, then an "ingesting" state that polls until done or failed. Client-side checks for allowed formats (MP3, FLAC, M4A/AAC, OGG/Opus, WAV) and a 250 MB limit. Optional per-file license (default "All rights reserved"). Failed ingest shows the reason and a retry action.

**Design rules carried from DESIGN.md**
- Amp Orange only for the primary action per view and active state; focus ring uses the focus token, never the accent. No spinners for page loads. No gradients on chrome. Text on artwork always over a scrim. Bottom padding equals player height plus 24px. Respect reduced motion. Touch targets at least 44px. Empty states guide users to upload.

**Delivery order (small commits)**
1. Scaffold, tokens, fonts, theme switching. 2. OpenAPI spec, generated client, MSW handlers and seed data. 3. App shell. 4. Auth flows. 5. Player store and audio engine (tests first), then player bar and queue drawer. 6. Explore, Library, Album, Artist. 7. Search. 8. Playlists, Liked, History. 9. Upload. 10. Admin and Settings. 11. Full-screen and mobile player, Media Session, shortcuts. 12. Polish pass against DESIGN.md. 13. Optional Playwright smoke test.

## Testing Decisions

- **What makes a good test:** exercise external, user-visible behavior (what renders, what the user can do, what requests and events are emitted); prefer queries by role and label; no snapshot tests; never assert on internal state shape or implementation details.
- **One seam: the UI boundary against the mocked API contract.** Vitest and Testing Library run against MSW so the same handlers serve dev and tests.
- **Modules covered:** the player/queue logic (next/previous, shuffle, repeat modes, persistence and restore, play-event thresholds and envelope), playlist reordering, upload state transitions (progress, ingesting, failed, retry, rejected file), and auth redirects (401 to login and back, setup screen visibility).
- **Optional:** one Playwright smoke test (set up admin, log in, upload, play) once a backend exists; not required for this spec to be done.
- **Prior art:** none (greenfield). The first player test establishes the conventions for the rest.

## Out of Scope

- The Spring Boot backend, database, object store, ingest pipeline and real streaming (covered by spec 01 and later specs).
- Kafka, ClickHouse, stats pages, yearly recap and everything in Phases 2–5.
- Podcasts, radio/live, community sections, regional trending, follow, download/offline, lyrics, device picker, verified badge, external source names, OpenSubsonic.
- Bangla content or font support, UI internationalization.
- Admin instance-wide stats dashboard, collaborative or smart playlists, per-user libraries.

## Further Notes

- This spec is the UI slice of spec 01; if the two disagree, update both. DESIGN.md Section 10 is authoritative for what to build, adapt or drop.
- The OpenAPI spec produced here becomes the backend's contract; changes to it should be reviewed as API changes, and CI should later verify the running backend against it.
- Definition of done: `pnpm dev` runs the full UI with no backend; typecheck, lint and tests pass in CI-ready scripts; every screen works at mobile, tablet and desktop widths in light and dark; the OpenAPI spec is complete enough for a backend engineer to implement without questions; the README explains how to run against the mock and swap in the real API.
- The prompt `docs/prompts/phase-1-ui.md` is a ready-to-use agent prompt for this work.

