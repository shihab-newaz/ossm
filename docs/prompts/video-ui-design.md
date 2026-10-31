# Video library: design prompt (Google Stitch / Claude Design)

Visual-only prompt for mocking up the video screens from spec 03. Every value is copied from `DESIGN.md`; nothing new is invented except the video layouts themselves, which reuse those values. Paste **Part A** first (or with every screen), then one screen from **Part B** at a time. Stitch works best one screen per prompt; Claude Design can take all of Part B at once.

---

## Part A: theme (paste with every screen)

Design screens for OSSM ("Open Source Streaming Music"), a self-hosted web app where people stream their own music and, now, their own video files (movies and TV shows). The video screens must look like they were always part of the existing app: same shell, same tokens, same components. Follow these values exactly. Do not invent colours, fonts, radii or shadows.

**Mood.** Playful discovery, calm watching. Chrome stays neutral; thumbnails and cover art carry the colour. Light theme is the default; the watch page is always dark. Not Netflix, not Plex, not Spotify: no all-black shell, no red or green accent, no heavy gradients, no glassmorphism, no neon.

**Colours, light theme**
- Canvas `#FFFFFF`. Subtle background (sidebar, input fill, section bands) `#F6F5F8`. Surface (cards, menus, dialogs) `#FFFFFF`.
- Hover `#EFEDF2`. Pressed/selected `#E6E3EB`.
- Border `#E4E1E8`. Strong border `#CFCAD6`.
- Text `#17151C`. Muted text `#5E5A68`. Subtle text `#8C8896`.
- Accent "Amp Orange" `#FF5A1F`, hover `#E84A12`, soft `#FFE9DF`, text on accent `#FFFFFF`.
- Focus ring `#2F6BFF` (never the accent).
- Success `#1F9D55`. Warning `#C98A00`. Danger `#D6293E`.

**Colours, dark theme**
- Canvas `#111014`. Subtle `#18171C`. Surface `#1E1D23`. Hover `#26252C`. Pressed `#302E36`.
- Border `#2C2A32`. Strong border `#3D3A45`.
- Text `#F4F2F7`. Muted `#A9A5B3`. Subtle `#7A7684`.
- Accent `#FF6A33`, hover `#FF8152`, soft `#3A2016`. Focus `#6F9BFF`.
- Success `#3FCB7E`. Warning `#F2B533`. Danger `#FF5A6E`.

**Category colours** (flat, same in both themes, white text on them): `#7B3FE4 #E0245E #1E88E5 #00897B #F4511E #C2185B #3949AB #43A047 #6D4C41 #D81B60 #00ACC1 #8E24AA`. Each show gets one of these, always the same one.

**Accent rule.** Amp Orange is only for the one primary action per screen (the Play button) and active states (active nav icon, progress fill, active tab underline). Never a large background fill, never decoration.

**Typography**
- Display/headings: Plus Jakarta Sans 700/800. Hero 56/60 (mobile 36/40) 800, tracking -0.02em. Page title 36/42 (mobile 28/34) 800, -0.015em. Section title 24/30 700, -0.01em, sentence case.
- UI/body: Inter. Card title 15/20 600. Body 15/22 400. Secondary line 13/18 400. Eyebrow 12/16 600 uppercase, tracking 0.06em.
- Technical metadata: JetBrains Mono 500, 12/16 (badges 11). Timecodes in mono with tabular numbers.
- Card titles and secondary lines truncate to one line with an ellipsis. Never more than two lines under a card.

**Shape and depth**
- Radius: 4px badges, 8px thumbnails in rows and menu items, 12px cards, covers and nav items, 16px tiles, 20px banners and dialogs, fully round (pill) for buttons, chips and search.
- Mostly flat. Shadows only on floating things: play button and covers on hover `0 6px 16px rgba(23,21,28,0.18)`; menus and dialogs `0 16px 40px rgba(23,21,28,0.20)`; player bar `0 -4px 16px rgba(23,21,28,0.06)`. In dark, use `rgba(0,0,0,0.5)` and rely on surface tone steps.
- Spacing scale: 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80 px. Content max width 1600px, side padding 32px (tablet 24, mobile 16). 40px between page sections (mobile 32). Section header row: H2 on the left, "See all" (Inter 13/600, muted) on the right, 16px above the content.

**App shell (already exists, keep it identical)**
- Desktop sidebar, 240px, background `#F6F5F8`, no border. Logo at top (32px mark + "OSSM" wordmark). Nav items 40px tall, 12px radius, 20px icon + Inter 15/500 label: **Home, Explore, Search, Library, Videos** (Videos is new; clapperboard icon). Active item: text colour label, Amp Orange icon, `#E6E3EB` background.
- Top bar 64px, sticky: back/forward 32px round ghost buttons, a pill search field (44px, `#F6F5F8` fill, no border, max 480px, leading search icon), account avatar on the right. It blurs (85% canvas + 12px blur) only once the page has scrolled.
- Bottom music player bar, 80px, surface colour, top hairline border: 56px cover and title/artist on the left, controls in the middle (shuffle, previous, a 40px round orange play button, next, repeat) with a timecode–slider–timecode row, quality badge, queue and volume on the right. Show it with a paused song loaded, so the screens look lived in.
- Mobile (<1024px): no sidebar; a 56px bottom tab bar with Home, Explore, Search, Library (24px icons, 11px labels), and a 64px mini-player above it with a 2px progress line on top.

**Shared components**
- Primary button: Amp Orange, white text, 44px tall, pill, Inter 15/600, 20px side padding. Secondary: transparent, 1px strong border, pill, 40px. Ghost icon button: 40px circle, muted icon.
- Play button: circle, Amp Orange, white filled play glyph. 56px in page headers, 48px on cards (it appears on hover, bottom-right of the thumbnail, 8px inset), 40px in the player.
- Page tabs: underline style, Inter 15/600, 2px Amp Orange indicator under the active tab.
- Quality badge: JetBrains Mono 11/500, 20px tall, 4px radius, 1px strong border, muted text. Video values look like `1080P · H.264`, `4K · HEVC`, `720P · VP9`.
- License chip: same style, e.g. `CC BY 3.0`, `CC0`, `All rights reserved`.
- Uploader line in mono meta: `Uploaded by @maya · 12 Oct 2026`.
- Loading states are skeleton blocks in the hover colour with the same radius as the real thing. No spinners on pages.
- Text on images always sits on a scrim. Focus ring: 3px `#2F6BFF`, 2px offset.

**Video-specific rules (built only from the values above)**
- Thumbnails are 16:9. 12px radius on cards, 8px in list rows. Never square, never round.
- Duration sits on the thumbnail's bottom-right as a small pill: mono 11, white text on a black scrim at 60%.
- Partly watched: a 3px bar along the thumbnail's bottom edge, Amp Orange fill on the strong-border colour. Watched: no bar, a small round success-green check badge top-right.
- Video card: thumbnail, then title (Inter 15/600), then one secondary line (Inter 13 muted): `2008 · 1h 52m` for a movie, `S2 · E5 · The Long Way Home` for an episode. No card background at rest; on hover the hover colour shows behind the whole card with an 8px bleed, and the 48px orange play button slides up 8px and fades in at the thumbnail's bottom-right.
- Carousel card widths for 16:9 cards: 280px on wide desktop, 72% of the screen on mobile. Gap 24px desktop, 12px mobile. Prev/next round ghost arrows in the section header on desktop.
- "May not play in this browser" badge: same shape as the quality badge but warning-coloured text (`#C98A00` light / `#F2B533` dark) with a small warning dot. On cards show just the dot with a tooltip.

**Sample content** (open-licensed films, so the mockups are realistic):
- Movies: Big Buck Bunny (2008, 10 min, 1080P · H.264, CC BY 3.0), Sintel (2010, 15 min, 4K · HEVC), Tears of Steel (2012, 12 min, 1080P · VP9), Elephants Dream (2006, 11 min, 720P · H.264), Cosmos Laundromat (2015, 12 min, 1080P · AV1), Spring (2019, 8 min, 4K · AV1), Agent 327 (2017, 4 min, 1080P · H.264), plus home videos like "Beach day 2024" (1h 04m, 1080P · HEVC, MKV, may not play).
- Shows (invented): "Night Kitchen" (3 seasons), "Field Notes" (2 seasons), "The Long Way Home" (1 season).
- Users: @maya (admin), @rafi.
- Thumbnails: cinematic stills with varied colour (warm forests, cold sci-fi blues, dusk orange, night scenes), never text-heavy.

---

## Part B: screens (one per prompt)

### 1. Videos: Movies tab (desktop, light)
The Videos page. Page title "Videos" (H1). Under it, page tabs "Movies | Shows" with Movies active. A row of filter chips on the right of the tab row: "Recently added" (selected: inverted, text-colour background with canvas-colour text), "A–Z", "Year", each a 32px pill, Inter 13/600, unselected `#F6F5F8` with text colour. Then a responsive grid of 16:9 video cards (`repeat(auto-fill, minmax(260px, 1fr))`, 24px gap) showing about 16 movies from the sample list. Two cards partly watched (orange progress bar), one watched (green check), one with the warning dot. Show one card in its hover state with the orange play button visible. Sidebar with "Videos" active. Music player bar at the bottom with a paused song.

### 2. Videos: Shows tab (desktop, light)
Same page with the Shows tab active (orange underline). Grid of 16:9 show cards: the latest episode's thumbnail with the show name on a bottom-left black scrim (Plus Jakarta Sans 20/24 800, white); under the card, secondary line `3 seasons · 24 episodes`. One show card has a progress bar ("in progress"). Everything else as screen 1.

### 3. Show page (desktop, light)
Header like the album page: a wash from the show's category colour at 55% fading into the canvas (`linear-gradient(180deg, colour 55% → canvas)`), max 320px tall. Inside it, bottom-aligned: a 16:9 key art thumbnail 360px wide (12px radius, shadow), and to its right an eyebrow "SHOW", the show name "Night Kitchen" as a 56px hero title, and a mono line `3 seasons · 24 episodes · Uploaded by @maya`. 24px below, an action row: 56px orange play button labelled "Resume S2 · E5", a secondary "Shuffle" pill, a ghost "more" icon. Then page tabs "Season 1 | Season 2 | Season 3" with Season 2 active. Then episode rows, 8–10 of them: a 160px-wide 16:9 thumbnail (8px radius) with a duration pill, then "E5 · The Long Way Home" (Inter 15/600), one line of description (Inter 13 muted, one line, ellipsis), and on the right the quality badge. Rows 1–4 watched (green check), row 5 half-watched (orange bar) and highlighted as "Up next"; one row shown hovered (hover background, play icon over the thumbnail).

### 4. Watch page (desktop, always dark)
Dark theme throughout (canvas `#111014`), sidebar and top bar also dark. At the top of the content area, the video player at 16:9, full content width, 12px radius, with a still from "Sintel" inside. Player controls overlaid at the bottom on a black scrim fading from 60% at the bottom to 0%: a seek bar (4px track `#3D3A45`, Amp Orange fill to 42%, a 12px white thumb), then a row: play/pause, back 10s, forward 10s, volume with a 100px slider, mono timecode `06:18 / 14:48`; on the right a subtitles button ("CC", active), picture-in-picture, fullscreen. Below the player: title "Sintel" (H1, 36/42), a secondary line `2010 · 14m 48s`, then the open-metadata row: quality badge `4K · HEVC`, license chip `CC BY 3.0` and `Uploaded by @maya · 12 Oct 2026`. A secondary pill "Edit details" on the right of the title. Below, an "Up next" section (H2) with a carousel of four movie cards. Music player bar hidden (no music loaded).

### 5. Watch page, episode with subtitles menu open (desktop, dark)
Same as screen 4 but for "Night Kitchen · S2 · E5 · The Long Way Home". The secondary line is a link `Night Kitchen` followed by `Season 2 · Episode 5 · 42m`. The subtitles menu is open above the CC button: a dark surface menu (`#1E1D23`, 12px radius, menu shadow, 6px padding, 36px items with 8px radius) listing "Off", "English" (checked), "Bangla", "Español", and a divider then "Add subtitle file…". On the right side of the page, an "Up next in Season 2" list of episode rows (160px thumbnails), E6 first.

### 6. Watch page, next-episode prompt and resume toast (desktop, dark)
Same episode, near the end: controls hidden, and in the bottom-right corner of the player a floating dark card (`#1E1D23`, 12px radius, menu shadow): small 16:9 thumbnail of the next episode, eyebrow "NEXT EPISODE", title "E6 · Salt and Smoke", a 40px orange round play button with a circular countdown ring showing "8", and a ghost "Cancel" text button. Separately show a toast bottom-centre: inverted pill (light `#F4F2F7` background, dark text), 44px tall, "Resumed at 21:40" with an orange "Start over" action.

### 7. Watch page, file the browser can't play (desktop, dark)
Same layout as screen 4 for "Beach day 2024". Instead of a video frame, the player area shows the dark surface with a centred empty-state: a 64px line icon (film strip with a slash) in subtle text, title "This file may not play in this browser" (Plus Jakarta Sans 20/700), one line of body "OSSM plays files as they were uploaded. This one is MKV with HEVC video, which this browser may not support." and a secondary pill "Try anyway". Metadata row shows `1080P · HEVC`, the warning badge "May not play in this browser", `MKV`, and the uploader line.

### 8. Explore page with video rows (desktop, light)
The existing Explore page: a featured banner (full width, 280px tall, 20px radius, album art with a bottom-left title on a black scrim 0→60%), a "Genres & moods" grid of flat category tiles (16px radius, white Jakarta 800 label top-left, a square cover rotated 18° bleeding off the bottom-right), and a "Recently added" album carousel (square covers). Below those, two new sections: "Continue watching" (16:9 cards with orange progress bars, episode cards show `S2 · E5 · …`) and "Recently added videos". Each section header has "See all" on the right and round ghost prev/next arrows.

### 9. Upload with videos in progress (desktop, light)
The Upload page. Title "Upload" (H1). A large drop zone: 20px radius, 2px dashed strong-border outline, `#F6F5F8` fill, an upload line icon, "Drop music or video files here" (Jakarta 20/700), helper text in muted Inter 13: "Music: MP3, FLAC, M4A, OGG/Opus, WAV up to 250 MB. Video: MP4, M4V, MOV, WebM, MKV up to 20 GB. Add .srt or .vtt files with the same name for subtitles." and a secondary "Choose files" pill. Below, a list of upload rows (56px, hairline dividers): a file-type icon, filename, a mono size/progress line and a 4px progress bar on the right:
- `Sintel.2010.4K.mp4`: uploading, `3.2 GB of 14.8 GB · about 6 min left`, orange bar at 22%. Nested under it, indented: `Sintel.2010.4K.en.srt`: "Waiting for video" in subtle text.
- `Night.Kitchen.S02E05.mkv`: "Ingesting…" with a skeleton-shimmer bar, and a small pill "Episode · Night Kitchen S2 E5".
- `Beach day 2024.mkv`: done, success check, warning badge "May not play in this browser".
- `holiday-notes.mov`: failed, danger text "No video stream found", a secondary "Retry" pill.
- `Gooseberry - Overture.flac`: done, `FLAC` badge (shows music still works here).

### 10. Edit video details dialog (desktop, light)
Over the watch page (dark page behind a `rgba(10,9,12,0.5)` backdrop), a light dialog, max 480px, 20px radius, 24px padding, dialog shadow. Title "Edit details" (Jakarta 24/700). A segmented control "Movie | Episode" (pill, Episode selected, inverted). Fields (44px, `#F6F5F8` fill, 12px radius, label above in Inter 13/600): "Show" (combobox showing "Night Kitchen" with a dropdown of existing shows and "Create 'Night Kitchn'"), "Season" and "Episode" side by side (number fields 2 and 5), "Episode title" ("The Long Way Home"). Footer: secondary "Cancel" and orange primary "Save".

### 11. Mobile: Videos and watch (390 × 844, both screens side by side)
Left: the Videos page on mobile, light. Page title 28/34, Movies|Shows tabs, a one-column list of 16:9 cards at full width minus 16px gutters, mini-player (64px) and tab bar (56px) at the bottom with Library active (Videos is reached from Library). Right: the watch page on mobile, dark: the player full-bleed at the top (no radius), controls visible after a tap (larger 44px touch targets, a centred 56px orange play/pause, back/forward 10s either side), then title 28/34, metadata row wrapping onto two lines, and the "Up next" list as rows with 120px thumbnails.

### 12. Loading and empty states (desktop, light)
Two frames. Left: the Videos page loading: skeleton 16:9 blocks (`#EFEDF2`, 12px radius) in the grid with two skeleton text lines under each, no spinner. Right: the Videos page with no videos yet: centred empty state, a 64px line clapperboard icon in subtle text, "No videos yet" (Jakarta 20/700), "Upload movies, shows or home videos and they'll show up here." (Inter 15 muted), and an orange primary "Upload videos" button.
