# DESIGN.md — OSSM (Open Source Streaming Music)

> A design system for OSSM, an open-source music platform. Feature set inspired by mainstream streaming apps; visual language inspired by Deezer's Explore/Channels experience — bright, tile-driven discovery on a calm, content-first shell. This file is written for AI coding agents: follow the tokens and rules literally.

Stack assumption: Next.js (App Router) + React + Tailwind CSS. All tokens are exposed as CSS custom properties and mapped into Tailwind.

> **Phase 1 scope note (added after the spec grilling):** this document describes the full visual language. Phase 1 builds only what the product spec supports: a self-hosted library of the user's own files. See **Section 10** for which elements are in scope, adapted, or deferred. Where this document mentions podcasts, radio/live, regional trending, community uploads, follow, download, lyrics, devices, external sources, or Bangla fonts, treat them as **out of scope for Phase 1** unless Section 10 says otherwise.

---

## 1. Visual Theme & Atmosphere

- **Mood:** Playful discovery, calm listening. The Explore surfaces are loud (saturated genre tiles, big artwork); the listening surfaces (album, playlist, queue, player) are quiet and let cover art carry the color.
- **Density:** Medium. Generous gutters, but carousels show many items per row — browsing should feel abundant.
- **Philosophy:**
  1. **Artwork is the hero.** UI chrome stays neutral so covers and genre tiles provide the color.
  2. **Color = category.** Every genre/mood/channel owns one saturated tile color. Color is used to *navigate*, not decorate.
  3. **One accent.** "Amp Orange" is reserved for primary action (play, follow, primary CTA) and active state. Never used as a background fill for large areas.
  4. **Open by design.** Source, license, and audio-quality metadata are first-class citizens, shown in a quiet mono style — OSSM's differentiator from closed platforms.
- **Themes:** Light is the default (Deezer-like airy canvas). Dark is fully supported and is the default inside the full-screen player.
- **Not this:** Not Spotify's all-black, green-accented look. No heavy gradients on chrome, no glassmorphism on the shell, no neon.

---

## 2. Color Palette & Roles

### 2.1 Core (Light theme)

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#FFFFFF` | App canvas |
| `--bg-subtle` | `#F6F5F8` | Sidebar, section bands, input fill |
| `--surface` | `#FFFFFF` | Cards, menus, dialogs |
| `--surface-hover` | `#EFEDF2` | Row/card hover |
| `--surface-active` | `#E6E3EB` | Pressed / selected row |
| `--border` | `#E4E1E8` | Hairlines, dividers |
| `--border-strong` | `#CFCAD6` | Input borders, focus-adjacent |
| `--text` | `#17151C` | Primary text |
| `--text-muted` | `#5E5A68` | Secondary text, artist names under titles |
| `--text-subtle` | `#8C8896` | Tertiary, timestamps, metadata |
| `--accent` | `#FF5A1F` | **Amp Orange** — play buttons, primary CTA, active nav, progress fill |
| `--accent-hover` | `#E84A12` | Accent hover |
| `--accent-soft` | `#FFE9DF` | Accent tinted chip / selected pill bg |
| `--on-accent` | `#FFFFFF` | Text/icon on accent |
| `--focus` | `#2F6BFF` | Focus ring (never the accent — keeps focus visible on orange) |

### 2.2 Core (Dark theme)

| Token | Hex |
|---|---|
| `--bg` | `#111014` |
| `--bg-subtle` | `#18171C` |
| `--surface` | `#1E1D23` |
| `--surface-hover` | `#26252C` |
| `--surface-active` | `#302E36` |
| `--border` | `#2C2A32` |
| `--border-strong` | `#3D3A45` |
| `--text` | `#F4F2F7` |
| `--text-muted` | `#A9A5B3` |
| `--text-subtle` | `#7A7684` |
| `--accent` | `#FF6A33` |
| `--accent-hover` | `#FF8152` |
| `--accent-soft` | `#3A2016` |
| `--focus` | `#6F9BFF` |

### 2.3 Semantic

| Token | Light | Dark | Role |
|---|---|---|---|
| `--success` | `#1F9D55` | `#3FCB7E` | Downloaded, synced, followed |
| `--warning` | `#C98A00` | `#F2B533` | Low-quality source, pending |
| `--danger` | `#D6293E` | `#FF5A6E` | Errors, remove, unfollow confirm |
| `--live` | `#E0245E` | `#FF4D82` | Live radio / "now streaming" dot |

### 2.4 Channel / Genre tile palette

Saturated, flat, one per category. Text on tiles is always white (`#FFFFFF`) and must pass 3:1 at display size. Assign deterministically (hash of genre slug → index) so a genre keeps its color everywhere.

| Token | Hex | Suggested use |
|---|---|---|
| `--tile-1` | `#7B3FE4` | Pop |
| `--tile-2` | `#E0245E` | Hip-hop / Rap |
| `--tile-3` | `#1E88E5` | Electronic |
| `--tile-4` | `#00897B` | Chill / Lo-fi |
| `--tile-5` | `#F4511E` | Rock |
| `--tile-6` | `#C2185B` | R&B / Soul |
| `--tile-7` | `#3949AB` | Jazz |
| `--tile-8` | `#43A047` | Folk / Acoustic |
| `--tile-9` | `#6D4C41` | Classical |
| `--tile-10` | `#D81B60` | Love / Mood |
| `--tile-11` | `#00ACC1` | Workout / Focus |
| `--tile-12` | `#8E24AA` | World / Regional (e.g. Bangla) |

Tiles use the same hex in both themes.

### 2.5 Artwork-derived color

On album/playlist/artist pages, extract the dominant color from the cover (e.g. `fast-average-color` or server-side via sharp). Use it **only** for the page header wash: `linear-gradient(180deg, <dominant @ 55%> 0%, var(--bg) 100%)`, max 320px tall. Clamp lightness so white header text stays ≥ 4.5:1.

> Phase 1 decision: the dominant color is computed **once at ingest on the backend** and stored on the album. The UI only clamps lightness for contrast.

---

## 3. Typography Rules

- **Display / headings:** `Plus Jakarta Sans` (700, 800) — rounded, friendly geometry that suits bold tile labels.
- **UI / body:** `Inter` (400, 500, 600), `font-feature-settings: "cv11", "ss01"`.
- **Metadata / technical:** `JetBrains Mono` (500) — bitrate, codec, license, source, durations in tables.
- Load via `next/font/google`. Fallback: `system-ui, -apple-system, "Segoe UI", sans-serif`.
- Support Bengali script: add `Hind Siliguri` as a fallback in the body stack for Bangla titles. *(Deferred: Bangla support is not part of Phase 1.)*

| Role | Font | Size / Line | Weight | Tracking |
|---|---|---|---|---|
| Hero (artist/album name) | Jakarta | 56 / 60 (mobile 36/40) | 800 | -0.02em |
| Page title (H1) | Jakarta | 36 / 42 (mobile 28/34) | 800 | -0.015em |
| Section title (H2) | Jakarta | 24 / 30 | 700 | -0.01em |
| Tile label | Jakarta | 20 / 24 (large tile 28/32) | 800 | -0.01em |
| Card title | Inter | 15 / 20 | 600 | 0 |
| Body | Inter | 15 / 22 | 400 | 0 |
| Secondary (artist line) | Inter | 13 / 18 | 400 | 0 |
| Caption / eyebrow | Inter | 12 / 16 | 600 | 0.06em, UPPERCASE |
| Mono meta | JetBrains Mono | 12 / 16 | 500 | 0 |
| Player timecode | JetBrains Mono | 12 / 16 | 500 | tabular-nums |

Rules: truncate card titles and artist lines to one line with ellipsis; section titles are sentence case ("New releases", not "NEW RELEASES"); numbers in tables and timecodes use `font-variant-numeric: tabular-nums`.

---

## 4. Component Stylings

### 4.1 App shell
- **Sidebar (desktop ≥1024px):** 240px wide, `--bg-subtle`, no border (the tone shift separates it). Logo top (32px mark + wordmark). Nav items: 40px tall, 12px radius, icon 20px + label Inter 15/500. Active: `--text` label, `--accent` icon, `--surface-active` bg. Below nav: "Your library" list (playlists) with 40px square thumbnails, 6px radius.
- **Top bar:** 64px, sticky, `--bg` with 85% opacity + `backdrop-filter: blur(12px)` once scrolled (only place blur is allowed). Contains back/forward (32px circular ghost buttons), search field, and account avatar.
- **Player bar:** fixed bottom, 80px (mobile: 64px mini-player above 56px tab bar). `--surface`, top border `--border`, shadow `--shadow-up`.

### 4.2 Channel / Genre tile (signature component)
- Aspect 16:9 on desktop grids, 1:1 in mobile 2-col grids. Radius **16px**. Flat `--tile-n` bg.
- Label top-left, 16px inset, white, Jakarta 800.
- Artwork: a representative cover 45% of tile height, bottom-right, rotated **18°**, offset so ~25% bleeds off the edge (`overflow: hidden` on tile), radius 8px, `--shadow-2`.
- Hover: tile scales `1.02`, artwork rotates to 12° and lifts 4px, 200ms `--ease-out`. No color change.
- Focus: 3px `--focus` ring, 2px offset.

### 4.3 Media cards
- **Album/playlist card:** square cover, 12px radius; title + one secondary line below (8px gap). Card itself has no background; hover shows `--surface-hover` behind the whole card (8px padding bleed) and reveals a **48px circular accent play button** at cover bottom-right (8px inset), sliding up 8px + fading in, 180ms.
- **Artist card:** circular cover (`border-radius: 50%`), centered name + "Artist" caption.
- **Podcast/radio card:** square cover, 12px radius, `--live` dot + "LIVE" eyebrow when applicable. *(Out of scope for Phase 1.)*
- **Hero/feature banner:** full content width, 280px tall (mobile 200px), 20px radius, cover or editorial image with bottom-left title on a 0→60% black scrim.

### 4.4 Buttons

| Variant | Style |
|---|---|
| Primary | `--accent` bg, `--on-accent` text, 44px tall, pill (`9999px`), Inter 15/600, px 20. Hover `--accent-hover`; press scale 0.97. |
| Play (FAB) | Circle 56px (page header) / 48px (card) / 40px (player). `--accent` bg, white filled play/pause glyph. Shadow `--shadow-2`. |
| Secondary | Transparent bg, 1px `--border-strong`, `--text`, pill, 40px. Hover `--surface-hover`. |
| Ghost / icon | 40px circle, transparent, `--text-muted` icon 20–24px. Hover `--surface-hover` + `--text`. |
| Toggle (like/follow) | Ghost icon; active state fills icon with `--accent`, 200ms pop (scale 1 → 1.2 → 1). |
| Destructive | `--danger` text on transparent; filled `--danger` only inside confirm dialogs. |

Disabled: 40% opacity, no hover, `cursor: not-allowed`.

### 4.5 Filter chips / tabs
- Pills 32px tall, Inter 13/600, px 14. Default: `--bg-subtle` bg, `--text`. Selected: `--text` bg, `--bg` text (inverted) — not accent. Horizontal scroll row, no scrollbar, 8px gap.
- Page tabs (Artist: Overview / Discography / About): underline style, 2px `--accent` indicator, Inter 15/600.

### 4.6 Search input
- 44px, pill, `--bg-subtle` fill, no border; focus: `--surface` fill + 2px `--focus` ring. Leading search icon 20px `--text-subtle`, trailing clear button. Max width 480px.
- Results page: "Top result" large card (left, 2 cols) + songs list (right), then carousels by type.

### 4.7 Track list (album/playlist)
- Row 56px, grid: `# | title+artist (cover 40px for playlists) | album | meta | added | duration | actions`.
- Hover: `--surface-hover`, index number swaps to play icon. Currently playing: title in `--accent`, index replaced by animated 3-bar equalizer (`--accent`).
- Column headers: caption style, sticky under top bar, bottom border `--border`.
- Row actions (like, more) appear on hover/focus only on desktop; always visible on touch.

### 4.8 Player bar
- Left (30%): 56px cover (8px radius), title (Inter 14/600) + artist (13 muted, links), like toggle.
- Center (40%): controls row — shuffle, prev, **play (40px accent circle)**, next, repeat; below, progress: timecode – slider – timecode.
- Right (30%): quality badge, lyrics, queue, device, volume slider (100px). *(Lyrics and device are out of scope for Phase 1.)*
- **Slider:** 4px track `--border-strong`, fill `--text` (idle) → `--accent` on hover; 12px thumb appears on hover/drag only.
- **Full-screen player:** always dark theme; blurred cover background (blur 80px, 35% opacity over `#111014`), cover 480px max, 16px radius, synced lyrics panel optional.

### 4.9 OSSM-specific: Open metadata
- **Quality badge:** mono 11/500, 20px tall, 4px radius, 1px `--border-strong`, `--text-muted`. Values: `FLAC`, `OPUS 160`, `MP3 320`. Lossless adds `--success` dot.
- **License chip:** mono 11, e.g. `CC BY-SA 4.0`, `CC0`, `All rights reserved`. Clicking opens a popover explaining the license.
- **Source line:** under album header — "Source: `jamendo` · Uploaded by @user · Verified" in mono meta. Verified uses a `--success` check.
- These are always visible on album/track detail, never in dense carousels.

### 4.10 Menus, dialogs, toasts
- Context menu: `--surface`, 12px radius, `--shadow-3`, 6px padding, items 36px, 8px radius, icon 18px. Keyboard navigable.
- Dialog: max 480px, 20px radius, 24px padding, `--shadow-3`, backdrop `rgba(10,9,12,0.5)`.
- Toast: bottom-center above player bar, `--text` bg / `--bg` text (inverted), pill, 44px, auto-dismiss 4s, optional "Undo" action in `--accent`.

### 4.11 Skeletons & empty states
- Skeleton: `--surface-hover` blocks with same radius as target, shimmer 1.4s linear. Always skeleton carousels, never spinners, for page loads.
- Empty state: 64px line icon `--text-subtle`, Jakarta 20/700 title, one-line body, secondary button.

---

## 5. Layout Principles

- **Spacing scale (px):** 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80. Use tokens `--space-1` … `--space-12`.
- **Content area:** max width 1600px, horizontal padding 32px (tablet 24, mobile 16).
- **Vertical rhythm:** 40px between page sections (mobile 32). Section header row: H2 left, "See all" (Inter 13/600 muted, → `--text` on hover) right, 16px above content.
- **Carousels:** horizontal scroll with snap (`scroll-snap-type: x mandatory`), prev/next ghost arrow buttons in section header on desktop. Card widths: 180px (≥1280), 164px (≥1024), 148px (≥640), 40vw (mobile). Gap 24px desktop / 12px mobile.
- **Explore grid:** CSS grid `repeat(auto-fill, minmax(260px, 1fr))`, gap 20px (mobile 2 cols, gap 12px). First row may feature one 2×-wide tile.
- **Explore page order:** Filter chips (All / Music / Podcasts / Radio / Community) → Featured banner carousel → "Genres & moods" tile grid → "New on OSSM" carousel → "Trending in your region" → "Fresh from the community" (user uploads, open-licensed) → "Radio & live". *(See Section 10 for the Phase 1 version of this page.)*
- **Detail page (album/playlist):** header 320px (cover 232px left, meta right, bottom-aligned), action row (Play FAB, shuffle, like, download, more) 24px below, then track list.
- Always leave `padding-bottom` = player height + 24px so content never sits behind the player.

---

## 6. Depth & Elevation

Mostly flat. Elevation is used for floating layers and artwork, not for cards at rest.

| Token | Value (light) | Use |
|---|---|---|
| `--shadow-1` | `0 1px 2px rgba(23,21,28,0.06)` | Subtle lift (inputs on focus) |
| `--shadow-2` | `0 6px 16px rgba(23,21,28,0.18)` | Play FAB, tile artwork, covers on hover |
| `--shadow-3` | `0 16px 40px rgba(23,21,28,0.20)` | Menus, dialogs, popovers |
| `--shadow-up` | `0 -4px 16px rgba(23,21,28,0.06)` | Player bar |

Dark theme: same offsets, use `rgba(0,0,0,0.5)` and rely more on surface tone steps (`--bg` → `--surface` → `--surface-hover`).

**Radius scale:** 4 (badges), 8 (thumbnails, menu items), 12 (cards, covers, nav), 16 (tiles), 20 (banners, dialogs), 9999 (buttons, chips, search).

**Motion:** `--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)`; durations 120 (press), 180 (hover reveal), 240 (panels), 320 (page/full-screen player). Respect `prefers-reduced-motion`: disable tile rotation, shimmer, and scale effects.

---

## 7. Do's and Don'ts

**Do**
- Let covers and genre tiles supply the color; keep chrome neutral.
- Use Amp Orange for exactly one primary action per view (usually Play).
- Keep genre colors stable across every surface (tile, chip dot, header wash).
- Show open metadata (license, source, quality) on detail pages — it's the product's identity.
- Use circular images only for people (artists, users); square for everything else.
- Provide keyboard shortcuts: Space play/pause, ←/→ seek 5s, Shift+←/→ prev/next, `/` focus search, L like.

**Don't**
- Don't paint large backgrounds with the accent or use it for decorative icons.
- Don't use gradients on buttons, nav, or the shell (only the artwork-derived header wash and the tile/banner scrims).
- Don't put text on artwork without a scrim.
- Don't mix Deezer/Spotify brand assets, logos, or their exact brand colors — OSSM has its own identity.
- Don't use spinners for content loads; don't let content hide behind the player bar.
- Don't show more than two lines of text under a card.

---

## 8. Responsive Behavior

| Breakpoint | Width | Changes |
|---|---|---|
| `sm` | ≥640 | 3-col tile grid, carousel cards 148px |
| `md` | ≥768 | Detail header side-by-side |
| `lg` | ≥1024 | Persistent 240px sidebar, full player bar |
| `xl` | ≥1280 | Sidebar may expand library; cards 180px |
| `2xl` | ≥1536 | Optional right "Now playing / Queue" panel (320px) |

- **Mobile (<1024):** sidebar → bottom tab bar (Home, Explore, Search, Library), 56px, icons 24px with 11px labels. Player collapses to a 64px mini-player (cover, title/artist, play, like) with a 2px progress line on top; tap expands to full-screen player (swipe down to dismiss).
- Detail header stacks: cover centered (min(70vw, 280px)), title below.
- Track list hides album/added/meta columns below `md`; row actions move to the `more` menu.
- Touch targets ≥ 44×44px. Hover-only affordances must have a visible or long-press alternative on touch.

---

## 9. Agent Prompt Guide

**Quick reference**
- Canvas `#FFFFFF` / dark `#111014` · Subtle `#F6F5F8` / `#18171C` · Text `#17151C` / `#F4F2F7`
- Accent Amp Orange `#FF5A1F` (dark `#FF6A33`) — play & primary only
- Tiles: `#7B3FE4 #E0245E #1E88E5 #00897B #F4511E #C2185B #3949AB #43A047 #6D4C41 #D81B60 #00ACC1 #8E24AA`
- Fonts: Plus Jakarta Sans (display), Inter (UI), JetBrains Mono (meta)
- Radii: cards 12, tiles 16, banners 20, buttons pill

**Tailwind mapping (tailwind.config)**
```js
colors: {
  bg: 'var(--bg)', 'bg-subtle': 'var(--bg-subtle)',
  surface: { DEFAULT: 'var(--surface)', hover: 'var(--surface-hover)', active: 'var(--surface-active)' },
  border: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
  fg: { DEFAULT: 'var(--text)', muted: 'var(--text-muted)', subtle: 'var(--text-subtle)' },
  accent: { DEFAULT: 'var(--accent)', hover: 'var(--accent-hover)', soft: 'var(--accent-soft)' },
},
borderRadius: { card: '12px', tile: '16px', banner: '20px' },
fontFamily: {
  display: ['var(--font-jakarta)', 'system-ui'],
  sans: ['var(--font-inter)', 'Hind Siliguri', 'system-ui'],
  mono: ['var(--font-jetbrains)', 'ui-monospace'],
},
```
Theme switch via `data-theme="dark"` on `<html>` plus `prefers-color-scheme` default.

**Ready-to-use prompts**
1. "Using DESIGN.md, build the OSSM Explore page: filter chips, a featured banner carousel, a 'Genres & moods' grid of channel tiles (flat tile color, bold label top-left, rotated cover art bleeding off bottom-right), then two album carousels with hover play buttons."
2. "Build the album detail page per DESIGN.md: artwork-derived header wash, 232px cover, hero title, action row with the Amp Orange play FAB, track list with now-playing equalizer, and the open-metadata line (source, license chip, quality badge)."
3. "Implement the persistent player bar and the mobile mini-player → full-screen player transition per DESIGN.md, including keyboard shortcuts and reduced-motion handling."
4. "Create the desktop app shell (240px sidebar, sticky blurred top bar with search, bottom player) and the mobile tab-bar layout from DESIGN.md sections 4.1 and 8."

---

## 10. Phase 1 Scope Mapping (OSSM-specific)

OSSM Phase 1 is a self-hosted library of the user's **own files**. Build the DESIGN.md look and structure, fed by real library data. Drop anything the backend will not support.

| Element above | Phase 1 treatment |
|---|---|
| Explore page | **Keep**, built from the user's own library |
| Filter chips (All / Music / Podcasts / Radio / Community) | Keep only **All** and **Music**, or omit the row |
| "Genres & moods" channel tiles | **Keep**, generated from genre tags in the library; deterministic tile colors |
| "New on OSSM" | **Adapt** → "Recently added" |
| "Trending in your region" | **Adapt** → "Most played" (count from play events) |
| "Fresh from the community" | **Drop** |
| "Radio & live", podcast/radio cards, `--live` token use | **Drop** |
| Featured banner | **Keep**, sourced from the user's own library (e.g. a featured or recently added album) |
| Follow, download, lyrics, device picker, verified badge | **Drop** (future work) |
| Open metadata | **Keep**: quality badge from ingest (codec + bitrate); license chip from an optional per-track license field, default "All rights reserved"; source line becomes "Uploaded by @user · date" (no external source names) |
| Artwork-derived header wash | **Keep**; dominant color computed at ingest and stored |
| Bangla font fallback / Bangla tile | **Deferred** |
| Dark theme, tokens, typography, motion, responsive rules | **Keep as written** |
