# Phase 1 UI build prompt

Prompt for building the OSSM Phase 1 web UI against a mocked API. Source documents: `DESIGN.md` and the Phase 1 spec (GitHub issue #1).

---

You are building the Phase 1 web UI for OSSM (Open Source Streaming Music), a
self-hosted music app for the user's own files. Read these first, in order:
1. DESIGN.md (repo root). Follow its tokens literally. Section 10 lists what is
   in scope, adapted, or dropped for Phase 1. It overrides everything above it.
2. docs/specs/01-phase-1-core-app.md (the Phase 1 spec) and
   docs/specs/02-phase-1-web-ui.md (its UI slice): user stories,
   implementation decisions, testing decisions, out of scope.

This is a portfolio project. The goal is a finished, polished, well-tested UI,
not breadth. It must not look like a Spotify clone or a generic template.

## Stack (fixed)
- Next.js App Router, TypeScript strict, React, pnpm. Runs as its own server
  (SSR available), behind a reverse proxy, same origin as the API.
- Tailwind CSS with DESIGN.md's tokens as CSS custom properties, mapped into the
  Tailwind config as in DESIGN.md Section 9. shadcn/ui (Radix) primitives
  restyled to the tokens. lucide-react icons.
- TanStack Query (server state), Zustand (player and queue state), dnd-kit
  (playlist reordering), TanStack Virtual (long lists).
- Fonts via next/font: Plus Jakarta Sans, Inter, JetBrains Mono. English only.
  Do NOT add Bangla fonts or i18n.
- Vitest + Testing Library for tests. Playwright is optional, do it last.

## API contract (build this first)
The backend (Spring Boot) does not exist yet. Hand-author an OpenAPI 3.1 spec
as the source of truth, in a shared contract location that the backend will
later build to. Endpoint groups: setup/auth/sessions, users (admin), uploads
and ingest status, library (tracks, albums, artists, genres, recently added,
most played, featured), search, audio streaming and cover art, playlists,
favorites, history, playback events. Errors use RFC 9457 problem details.
- Generate a typed TypeScript client from the spec (openapi-typescript or Orval).
  All network calls go through it. No hand-written fetches.
- Mock the API with MSW so the whole UI runs standalone (dev server and tests).
  Seed the mock with realistic data: ~200 tracks, 30 albums, 20 artists, a
  spread of genres, cover art, quality values (MP3 320, FLAC, OPUS 160),
  licenses (mostly "All rights reserved", some CC BY, CC0), two users.
  Include failure cases: an ingest that fails with a readable reason, an
  unsupported file, a 401, a 500.
- Auth is an HttpOnly cookie session. The UI never reads or stores tokens.

## Screens (Phase 1 scope only)
1. First-run setup: create admin. Shown only when no users exist.
2. Login.
3. Home/Explore (DESIGN.md Section 10 version): optional All/Music chips, a
   featured banner from the library, "Genres & moods" tiles generated from genre
   tags with deterministic colors (hash of genre slug), "Recently added"
   carousel, "Most played" carousel.
4. Library with Tracks / Albums / Artists tabs. Virtualized lists.
5. Album page: header wash from the album's stored dominant color (clamp
   lightness so white text stays >= 4.5:1), 232px cover, hero title, action row
   with the Amp Orange play FAB, track list with now-playing equalizer, and the
   open-metadata line: quality badge, license chip (click opens a popover
   explaining the license), "Uploaded by @user · date".
6. Artist page: albums and tracks.
7. Search: one field, also opened by Cmd/Ctrl+K and "/". Debounced. Grouped
   results (top result, tracks, albums, artists).
8. Playlists: list, detail, create/rename/delete, drag-to-reorder, private by
   default with an "Visible to everyone on this instance" toggle. Sidebar shows
   playlists with 40px thumbnails.
9. Liked and History pages.
10. Upload: drag-and-drop multi-file zone. Per-file progress for a direct
    presigned multipart upload, then an "ingesting" state that polls until done
    or failed. Failed shows a readable reason and a retry action. Client-side
    checks: allowed formats (MP3, FLAC, M4A/AAC, OGG/Opus, WAV) and a 250 MB
    limit. Optional license field per file (default "All rights reserved").
11. Admin: user list, create user / invite link, deactivate user.
12. Settings: change password, theme (light / dark / system).

## Persistent player (the most important part)
- Fixed bottom bar in the root layout so navigation never interrupts playback.
  Mobile (<1024px): 64px mini-player that expands to a full-screen player
  (swipe down to dismiss), plus the bottom tab bar, per DESIGN.md Sections 4 and 8.
- Controls: play/pause, previous/next, seek bar, volume, shuffle, repeat
  (off/all/one), elapsed/remaining time (tabular mono), like toggle, quality
  badge, queue button. No lyrics or device controls.
- Queue drawer: view, reorder, remove, "play next", "add to queue".
- Near-gapless transitions: preload the next track in a second audio element and
  swap at the end of the current one.
- Media Session API: metadata, artwork, and OS media keys.
- Keyboard shortcuts: Space, arrows seek 5s, Shift+arrows previous/next, M mute,
  L like, "/" search, "?" opens a shortcut help dialog.
- Queue and position persist to localStorage and restore paused on reload.
- Audio source is an authenticated same-origin stream URL from the API (the API
  proxies with range support). Never use an object-store URL.
- Emit playback events to the API: play_started, play_completed, skipped. A
  "play" counts at 30s or 50% of the track, whichever comes first. Each event
  carries event id (uuid), track id, type, timestamp, position in ms, client
  identifier. Keep this logic in one testable module.

## Hard constraints
- Do NOT build: podcasts, radio/live, "community" sections, regional trending,
  follow, download/offline, lyrics, device picker, "verified" badge, external
  source names (no "Source: jamendo"), Bangla support.
- Amp Orange only for the primary action per view and active state. Never fill
  large areas with it. Focus ring is --focus, never the accent.
- No spinners for page loads (skeletons). No gradients on chrome. Text on
  artwork always sits on a scrim. Content never hides behind the player
  (bottom padding = player height + 24px).
- Respect prefers-reduced-motion (disable tile rotation, shimmer, scale effects).
- Touch targets >= 44px. Hover-only affordances need a touch alternative.
- Accessibility: keyboard navigable menus and dialogs, labelled controls, visible
  focus, AA contrast, aria-live for ingest status and toasts.
- Empty states for new instances guide the user to upload.

## Build order (commit after each step, small commits)
1. Project scaffold, tokens, fonts, theme switching (light default, dark, system).
2. openapi.yaml, generated client, MSW handlers and seed data.
3. App shell: sidebar, sticky top bar with search, bottom player area, mobile tab bar.
4. Auth screens and the session/redirect flow (setup, login, logout, 401 handling).
5. Player store and audio engine with tests first (queue, shuffle, repeat,
   persistence, event thresholds), then the player bar and queue drawer.
6. Explore, Library, Album, Artist pages.
7. Search (palette and results).
8. Playlists (including reorder), Liked, History.
9. Upload flow.
10. Admin and Settings.
11. Full-screen and mobile player, Media Session, keyboard shortcuts and help.
12. Polish pass against DESIGN.md: every token, radius, motion and empty state.
13. Optional: one Playwright smoke test (set up admin, log in, upload, play).

## Tests (behavior only, never implementation details)
- Vitest + Testing Library against the MSW mock: player and queue behavior
  (next/previous, shuffle, repeat modes, persistence and restore, play-event
  thresholds), playlist reorder, upload state transitions (progress, ingesting,
  failed, retry, rejected file), auth redirects.
- No snapshot tests. Prefer queries by role and label.

## Definition of done
- pnpm dev runs the full UI standalone against the mock with no backend.
- Typecheck, lint and tests pass in CI-ready scripts.
- Every screen above works at mobile, tablet and desktop widths, in light and dark.
- The openapi.yaml is complete enough for a backend engineer to implement without
  asking questions.
- README section explaining how to run the UI against the mock and later swap in
  the real API.
