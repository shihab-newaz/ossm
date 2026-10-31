# Video library UI build prompt

Prompt for building the OSSM video library web UI (spec 03, tickets 20–27, web side) against a mocked API. Source documents: `DESIGN.md`, `docs/specs/03-video-library.md`, ADRs 0006, 0007 and 0009.

---

You are adding a video library to the OSSM web app (`web/`). OSSM is a
self-hosted streaming app for the user's own files. Music already works; this
adds movies and shows, played straight from the file (no transcoding). Read
these first, in order:
1. CLAUDE.md (repo root): how the frontend is built and checked.
2. DESIGN.md: follow its tokens literally. It has no video section; the
   "Video design rules" below extend it, using only its existing tokens.
3. docs/specs/03-video-library.md: user stories, decisions, out of scope.
4. docs/adr/0007-player-engine-outside-react.md: the pattern the video engine
   must copy. docs/adr/0006 for how streams behave (single byte range, auth).
5. The existing code you will mirror: web/src/player/ (engine, keymap, media
   session, slider), web/src/library/ and web/src/explore/ (lists, carousels,
   cards, skeletons), web/src/upload/ (uploader and screen).

This is a portfolio project. Match the quality and conventions of the music
side exactly; the video side should look like it was always part of the app,
not bolted on. It must not look like Netflix, Plex or Jellyfin.

## Stack (fixed, already in the repo)
- Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 with the
  tokens in src/styles/tokens.css (CSS variables, never raw hex), pnpm.
- TanStack Query for all server state. No useEffect fetches, no SWR.
- All API calls through the typed openapi-fetch client in src/api/client.ts.
- Vitest + Testing Library + MSW. lucide-react icons.
- Do not add a state library or a video player library (no video.js, no
  Plyr, no hls.js). A plain <video> element behind an interface, like audio.

## API contract (do this first)
The video backend does not exist yet. Contract first:
- Add the video endpoints to contract/openapi.yaml, then run `pnpm gen:api`.
  Never hand-edit schema.d.ts or hand-write request types. Groups:
  - uploads: `kind` (AUDIO | VIDEO) on create; part URLs issued in pages
    (`GET /api/v1/uploads/{id}/parts?from=N`), since a 20 GB file has ~1,280
    16 MiB parts.
  - videos: list (paged, `X-Total-Count`, filter kind=MOVIE|EPISODE), detail,
    `PATCH` metadata (kind, title, year, show name, season, episode, episode
    title), recently added, continue watching.
  - shows: list (paged), detail with seasons and ordered episodes.
  - media: `/videos/{id}/stream`, `/videos/{id}/thumbnail`,
    `/videos/{id}/subtitles` (list) and `/subtitles/{n}` (text/vtt),
    `POST /videos/{id}/subtitles` (sidecar .srt/.vtt, small multipart form).
  - progress: `PUT /videos/{id}/progress` (position ms, duration ms).
  - Video fields: id, kind, title, year, show {id, name} | null, season,
    episode, episodeTitle, durationMs, width, height, videoCodec, audioCodec,
    container, bitrateKbps, playable, license, uploader {username},
    createdAt, progress {positionMs, watched} | null, subtitleCount.
  - Errors are RFC 9457 problem details, like everything else.
- Extend the MSW handlers and seed data: ~40 movies and 4 shows (2–3 seasons,
  6–10 episodes each), a spread of resolutions (720p, 1080p, 2160p) and codecs
  (H.264, HEVC, AV1, VP9), containers MP4/WebM/MKV, about 1 in 6 with
  `playable: false`, some with subtitles in 1–3 languages, some in progress,
  some watched. Thumbnails: generated 16:9 SVG placeholders served by the
  mock, not stock photos. For the stream, serve a tiny real test clip so the
  <video> element can play in the dev server.
  Failure cases: a video ingest that fails ("No video stream found"), a file
  over 20 GB, an ffprobe timeout, a 404 on a missing stream.

## Video design rules (extend DESIGN.md with its existing tokens)
- Thumbnails are 16:9, radius 12px (cards) or 8px (list rows). Never square,
  never circular.
- Video card: thumbnail, then title (card title style) and one secondary line
  ("2019 · 1h 52m" for movies, "S2 · E5 · Episode title" for episodes). No
  card background; hover uses --surface-hover with an 8px bleed and reveals
  the 48px accent play FAB at the thumbnail's bottom-right, exactly like
  album cards. Duration sits bottom-right on the thumbnail in mono 11 on a
  small dark scrim pill.
- Progress: a 3px bar along the thumbnail's bottom edge, fill --accent on a
  --border-strong track. Watched items get a small check badge top-right
  instead (--success), no bar.
- Carousel widths for 16:9 cards: 280px (≥1280), 248px (≥1024), 220px
  (≥640), 72vw on mobile. Gaps as DESIGN.md Section 5.
- Quality badge (mono, DESIGN.md 4.9): "1080P · H.264", "4K · HEVC",
  "720P · VP9". Resolution label from height: ≥2000 → 4K, ≥1000 → 1080P,
  ≥700 → 720P, else the height + "P".
- "May not play in this browser" badge for `playable: false`: same badge
  shape, --warning text and a --warning dot, with a popover explaining that
  OSSM plays files as stored and this container or codec may not be supported
  by every browser. Shown on cards (dot only, with an accessible label) and in
  full on the watch page.
- Show page: header like the album page, but the wash colour is a
  deterministic tile colour from the show name (same hash rule as genres),
  since shows have no stored dominant colour. Season switcher uses the page
  tabs style (underline, 2px accent). Episodes are rows: 16:9 thumbnail
  160px, "E5 · Title", duration, progress bar, play on hover.
- Watch page is always dark theme, like the full-screen music player: player
  at the top, max 16:9 of the content width (letterboxed in black #000 inside
  the player only), then title (H1), a secondary line (show link · season ·
  episode, or year · duration), the open-metadata row (quality badge,
  playable badge if needed, license chip, "Uploaded by @user · date"), and
  for episodes an "Up next" list of the rest of the season.
- Player controls overlay the video on a bottom-up 0→60% black scrim (the
  only gradient allowed here). They auto-hide after 3s of no pointer movement
  while playing, and stay visible while paused or focused. Reuse the music
  Slider component and the --accent fill. Mono tabular timecodes.

## Screens
1. Sidebar: a "Videos" nav item under the music items (lucide Clapperboard).
   Mobile tab bar stays at four tabs; Videos is reached from Library.
2. /videos with page tabs Movies | Shows. Movies: a virtualized grid of video
   cards. Shows: a grid of 16:9 show cards (latest episode thumbnail, show
   name, "3 seasons · 24 episodes").
3. /videos/shows/[id]: show page as above.
4. /watch/[id]: watch page as above.
5. Explore: two new carousels after the music rows, "Continue watching" and
   "Recently added videos", each hidden when empty.
6. Upload screen: one drop zone for both kinds. Detect kind from the file's
   type/extension for the UI (the server sniffs bytes for real). Video caps
   and formats: MP4, M4V, MOV, WebM, MKV up to 20 GB; audio keeps its 250 MB
   cap. Update the helper text to list both. For multi-GB files show
   transferred / total (e.g. "3.2 GB of 14.8 GB") and a rough time remaining.
   Fetch part URLs page by page as the upload progresses. Sidecar .srt/.vtt
   dropped with a video are matched by filename stem and attached once the
   video finishes ingesting (show them nested under their video row).
7. Edit metadata dialog on the watch page (uploader and admins only): kind
   (Movie / Episode segmented control), title, year; for episodes show name
   (combobox of existing shows, or a new name), season, episode, episode title.
8. Empty states: /videos with no videos leads to upload, per DESIGN.md 4.11.

## Video player (the most important part)
- A separate engine module, web/src/video/engine.ts, with the same
  getState/subscribe shape as player/player.ts, read through
  useSyncExternalStore. The <video> element sits behind a small interface and
  is created through a factory, so tests use a fake element. No queue.
- It lives on the watch page, not in the root layout. Leaving the page stops
  it (after saving progress).
- Starting a video pauses the music engine. Music does not resume on its own.
  The music player bar stays visible on the watch page only if music is loaded;
  it must never play at the same time as video.
- Controls: play/pause, seek (±10s buttons too), elapsed/remaining, volume,
  mute, subtitles menu (languages + Off, remembered in localStorage), picture-
  in-picture, fullscreen. If the element errors and the video is not
  playable, replace the player with a clear message and the badge's
  explanation, not a broken frame.
- Keyboard (extend player/keymap.ts, same typing guards): Space or K
  play/pause, ←/→ seek 5s, J/L seek 10s while a video is active (L stays
  "like" for music), F fullscreen, M mute, C toggle subtitles, Esc exits
  fullscreen. Add them to the "?" help dialog under a Video heading.
- Subtitles as <track kind="subtitles"> elements from the subtitles endpoint.
- Resume: start at the saved position with a dismissible "Resumed at 42:10 ·
  Start over" toast, unless watched. Watched = 90% reached or fewer than
  2 minutes left (pure function, unit tested).
- Progress reports: every 15s while playing, on pause, after a seek settles,
  and on pagehide (fetch with keepalive). Throttled; one module, tested with
  fake timers.
- Next episode: in the last 20s of an episode (or on ended), a card offering
  the next episode (crossing seasons) with a 10s countdown and Cancel. No
  countdown under prefers-reduced-motion; just the card and a button.
- Media Session: title, show/year, thumbnail artwork, play/pause and seek
  handlers.
- Source is always the same-origin `/api/v1/videos/{id}/stream`. Never an
  object-store URL, never a hardcoded backend host.

## Hard constraints
- Do NOT build: transcoding or quality pickers, HLS/DASH, scrub-bar
  thumbnails, chapters, skip intro, audio track switching, external metadata
  or posters (TMDB etc.), cast/crew, casting, download, collections, ratings.
- Amp Orange only for the primary action per view (Play) and active state.
  Focus ring is --focus. No gradients except the player scrim, the show
  header wash and existing banner/tile scrims. Text on thumbnails always on a
  scrim.
- No spinners for page loads (skeletons in 16:9). A buffering indicator inside
  the player is allowed and must respect reduced motion.
- Touch targets ≥ 44px; auto-hidden controls reappear on tap. Hover-only
  affordances need a touch alternative.
- Accessibility: every control labelled, the player operable by keyboard only,
  captions reachable by keyboard, aria-live for ingest status and the
  next-episode countdown (polite, not every second), AA contrast in dark.
- Content never hides behind the player bar (existing bottom padding rule).

## Build order (small commits, each with tests)
1. Contract additions, `pnpm gen:api`, MSW handlers and seed data.
2. Pure functions with tests: resolution label, watched threshold, filename
   kind guess for the upload UI, sidecar matching.
3. Video engine with a fake element, tests first; then the controls UI.
4. Watch page, including the not-playable state, subtitles and resume.
5. Progress reporting module and Continue watching data.
6. /videos (Movies, Shows) and the show page.
7. Explore carousels.
8. Upload screen changes (kind, caps, paged parts, sidecar subtitles).
9. Edit metadata dialog and next episode.
10. Keyboard shortcuts, Media Session, mobile layout of the watch page.
11. Polish pass against DESIGN.md and the rules above, light and dark.

## Tests (behaviour only)
- Vitest + Testing Library against MSW: engine (play, pause, seek, ended,
  error), music pauses when a video starts, resume and Start over, watched
  threshold, progress throttling with fake timers, subtitles menu, next
  episode countdown and cancel, upload of a video (paged parts, GB progress,
  over-cap rejection, sidecar attach), not-playable message, edit dialog
  permissions (hidden for other users).
- Query by role and label. No snapshot tests.

## Definition of done
- `pnpm dev` runs the video UI standalone against the mock.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm check:api` pass from
  web/ (commit the regenerated schema.d.ts).
- Every screen works at mobile, tablet and desktop widths in light and dark;
  the watch page is dark in both.
- contract/openapi.yaml is complete enough for tickets 20–25 to implement the
  backend without questions.
- Update PROGRESS.md: note which ticket acceptance criteria the UI now covers
  on the web side.
