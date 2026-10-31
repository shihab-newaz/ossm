# Spec 03: Video vault

Status: ready-for-agent

## Problem Statement

I have personal videos on my PC: phone clips, screen recordings, downloads I want to keep. I want them somewhere safer and more pleasant than a folder: a private place I can upload them to, scroll through as thumbnails, watch in the browser, and download again whenever I need the original. Today they sit on one disk. Later I want them on a real S3 cluster, so where the files live must not lock me in. OSSM already has accounts, direct-to-store uploads, a job queue and streaming for music, so the vault should live in the same app and reuse that machinery.

This is a vault, not a media center. It does not need movies and shows, subtitles, watch history or transcoding.

## Solution

A **Videos** section next to music. Each user has a private **vault**. Nobody else can see it, admins included. The user uploads video files from the browser straight to the object store, the same way audio goes. The server checks that the bytes really are a video container, fingerprints the file, and skips exact duplicates of something already in that user's vault. The **original** is stored byte-for-byte and never altered.

While uploading, the browser grabs one frame and the duration and resolution from the local file, and saves them once ingest finishes. The vault is a grid of 16:9 thumbnails, newest first. A watch page plays the original directly through the API with range requests. If the browser can't decode a file, the page says so and offers **Download original**, which is always available anyway. The user can rename a video, give it a description, delete it, find it by searching titles and descriptions, and group videos into ordered **video playlists**.

The server never runs ffmpeg. Object keys are grouped per user and per video and don't depend on the store, so moving from SeaweedFS on a local SSD to an S3 cluster is a bucket copy and a config change.

## User Stories

### The vault

1. As a user, I want a Videos entry in the sidebar, so that my videos are one click away but separate from music.
2. As a user, I want my vault to be private to me, so that other users on the instance can't see that my videos exist.
3. As a user, I want admins to be unable to see or open my videos, so that "private" means private.
4. As a user, I want my vault shown as a grid of 16:9 thumbnails, newest first, so that I can scan it like a video site.
5. As a user, I want each tile to show the title and duration, so that I can tell videos apart at a glance.
6. As a user, I want a placeholder tile when a video has no thumbnail, so that the grid stays tidy for files the browser couldn't read.
7. As a user, I want the grid to load more as I scroll, so that a large vault opens quickly.
8. As a user, I want an empty vault to show a clear prompt to upload, so that I know what to do first.
9. As a user whose account is deactivated, I want my vault kept untouched, so that reactivation gives me everything back.

### Uploading

10. As a user, I want to upload videos from an Upload button in the Videos section, so that adding a video is one step.
11. As a user, I want to drop several files at once, so that I can move a folder's worth of clips in one go.
12. As a user, I want per-file progress, so that I know a multi-GB upload is still moving.
13. As a user, I want files up to 20 GB accepted by default, so that long recordings fit.
14. As an operator, I want the video size cap configurable, so that I can match it to my disk.
15. As a user, I want MP4, M4V, MOV, WebM and MKV accepted, so that the formats my devices produce just work.
16. As a user, I want a file that isn't a real video container rejected with a readable reason, even if it has a video extension, so that junk doesn't land in my vault.
17. As a user, I want a file I already uploaded recognised as a duplicate and pointed at the existing video, so that my vault has no copies.
18. As a user, I want duplicate detection to look only at my own vault, so that another user's upload never affects mine.
19. As a user, I want a failed upload to show its reason and a retry button, exactly like audio, so that recovery works the same everywhere.
20. As a user, I want a new video titled after its filename, so that it has a sensible name without typing.

### Thumbnails and details

21. As a user, I want a thumbnail captured from the video while it uploads, so that it shows up in the grid without extra work.
22. As a user, I want duration and resolution recorded when my browser can read them, so that I see how long a video is and its quality.
23. As a user, I want a video that has no thumbnail to get one the first time I watch it, so that the grid fills itself in over time.
24. As a user, I want closing the tab before ingest finishes to cost me nothing but a missing thumbnail until the first watch, so that the vault never depends on me waiting.

### Watching

25. As a user, I want a watch page with a large player, the title, description, upload date, duration and size, so that watching feels like a video site.
26. As a user, I want play/pause, seek, volume, fullscreen and picture-in-picture, so that I have the controls I expect.
27. As a user, I want seeking anywhere in a large file to start quickly, so that I can jump around a long recording.
28. As a user, I want music to pause when I start a video, so that two things never play at once.
29. As a user, I want the watch page to tell me when my browser can't play a file and offer Download original, so that I'm never stuck.
30. As a user, I want only signed-in users to reach a stream, and only for their own videos, so that links to my videos are useless to anyone else.

### My files

31. As a user, I want to download the original of any video, byte-for-byte and under its original filename, so that the vault is a real backup.
32. As a user, I want the original never altered (no re-encode, no remux, no metadata rewrite), so that what I get back is what I put in.
33. As an operator, I want object keys that don't depend on the store and are grouped per user and per video, so that moving to another S3-compatible cluster is a copy and a config change.

### Editing and deleting

34. As a user, I want to edit a video's title, so that I can fix filenames like `VID_20240611_183012`.
35. As a user, I want to add or edit a description, so that I can note what a video is and find it later.
36. As a user, I want to delete a video after confirming, so that I can remove something for good.
37. As a user, I want deleting a video to also remove its file and thumbnail from storage, even if the server restarts halfway, so that deleted videos don't quietly fill my disk.
38. As a user, I want a deleted video to disappear from my playlists, so that no playlist points at nothing.

### Search

39. As a user, I want a search box on the Videos page that filters my vault by title and description, so that I can find one clip among hundreds.
40. As a user, I want search to tolerate partial words and small typos, so that I find "birthday" by typing "bday" or "brthday".
41. As a user, I want video search to stay separate from music search, so that each section's search shows only its own things.

### Playlists

42. As a user, I want to create, rename and delete video playlists, so that I can group related videos.
43. As a user, I want to add a video to one or more playlists from its watch page, so that organising happens where I'm looking.
44. As a user, I want to remove a video from a playlist, so that I can tidy one up.
45. As a user, I want to reorder videos in a playlist, so that they're in the order I choose.
46. As a user, I want a video to appear at most once in a playlist, so that adding it twice does nothing surprising.
47. As a user, I want deleting a playlist to leave its videos in my vault, so that tidying playlists never loses files.
48. As a user, I want a Playlists tab with each playlist's cover taken from its first video's thumbnail, so that playlists are easy to tell apart.
49. As a user, I want a playlist page that lists its videos in order, each opening the watch page, so that I can work through a set.
50. As a user, I want my playlists to be private like my videos, so that nobody else sees how I organise them.

## Implementation Decisions

**Domain**
- New terms (to add to the glossary): **Vault**, a user's private set of videos. **Video**, an uploaded video file and its details. **Original**, the stored file exactly as uploaded. **Video playlist**, an ordered, private list of a user's videos.
- A video is flat: no kinds, shows, seasons or episodes. The title defaults to the filename without its extension. The description is free text and defaults to empty.
- Everything about video is per owner. Every read and write is scoped to the signed-in user, and someone else's video is a `404`, not a `403`, so its existence doesn't leak. There is no admin override.
- Users are only ever deactivated. Deactivation leaves the vault alone.

**Ingest without ffmpeg (ADR 0010)**
- The server never runs ffmpeg or ffprobe. It checks magic bytes for ISO BMFF (`ftyp`: MP4, M4V, MOV) and EBML (WebM, MKV) and records the container. Anything else fails with a readable reason.
- Whether an upload is audio or video comes from where it was started (the Videos upload button), not from sniffing. An audio-only file in an MP4 container would be accepted and play as a black screen. That's acceptable.
- The ingest job computes SHA-256 with a streaming read. If the owner already has a video with that hash, the upload ends `DUPLICATE`, points at the existing video, and its object is removed by the object-deletion job.
- There is no playability rule and no `playable` flag. The browser finds out when it tries to play.

**Uploads (ADR 0005, extended)**
- The existing `upload` table, handshake, status flow, failure list and retry are reused. An upload gains a **kind** (`AUDIO` or `VIDEO`) and, for video, a link to its video.
- The size cap is per kind and configurable: 250 MB for audio, 20 GB for video by default.
- The part size scales with the file so the part count stays under S3's limit of 10,000, with today's 16 MiB as the minimum. Audio behaves exactly as it does now. All presigned part URLs are issued when the upload starts, with no paging.
- A video's id is its upload's id, so its object key is known before ingest runs.

**Storage layout**
- The original goes at `video/<owner_id>/<video_id>/original.<ext>` and the thumbnail at `video/<owner_id>/<video_id>/thumb.jpg`. Deleting a video deletes its prefix, and exporting a user's vault copies `video/<owner_id>/`. The full key is stored on the row, so a future layout change doesn't break old videos.

**Object deletion**
- Deleting a video removes its row and enqueues a delete-prefix job on the existing db-scheduler queue in the same transaction. The job retries until the store confirms. Cleaning up a duplicate upload uses the same job. Postgres stays the system of record (ADR 0002), and orphan files can't build up silently.

**Thumbnails and browser metadata**
- A web module, the **frame grabber**, takes a local file and returns a JPEG frame from about 10% in (scaled to 640 px wide) plus the duration, width and height, or says it couldn't read the file.
- During upload the browser keeps what the grabber returned. Once the upload reaches `DONE` it calls one endpoint that saves the thumbnail and the metadata. The watch page calls the same endpoint when it plays a video that has no thumbnail yet, capturing from the playing element. That one path covers both new uploads and backfill.
- The server accepts a JPEG up to a small size cap, stores it at the thumbnail key, and records duration, width and height. These values come from the browser, so they're nullable and only for display.

**Schema (one migration for the vault, one for playlists)**
- The vault migration replaces the unmerged `V9` from the old video branch. The dev DB already applied that one, so it needs a one-time manual swap: confirm the old video tables are empty, drop them, undo the old upload changes, delete the `V9` row from Flyway's history, then let the new `V9` run. Only with explicit approval at the time, and no music data is touched.
- `video`: `id` (the upload id), `owner_id`, `title`, `description`, `original_filename`, `container` (`MP4`, `MOV`, `WEBM`, `MKV`), `object_key` (unique), `size_bytes`, `content_hash` (not null), nullable `duration_ms`, `width`, `height`, `thumbnail_key`, a generated `search_text` (title plus description), `created_at`, `updated_at`. Unique on (`owner_id`, `content_hash`).
- `upload` gains `kind` (default `AUDIO`) and `video_id`, which references `video` with `ON DELETE CASCADE`. Upload rows are transfer history, and the vault is the `video` table. A check guarantees that a `DONE` or `DUPLICATE` upload points at exactly one of `track_id` or `video_id`, matching its kind.
- `video_playlist`: `id`, `owner_id`, `name`, `description`, `created_at`, `updated_at`.
- `video_playlist_item`: `playlist_id` (cascade), `video_id` (cascade), `position`, `added_at`. The primary key is (`playlist_id`, `video_id`), so a video appears at most once.
- Foreign keys to `users` are plain, with no cascade.

**Indexes, each tied to a query**

| Query | Index |
|---|---|
| Vault grid: owner's videos, newest first, keyset pages | `video (owner_id, created_at DESC, id DESC)` |
| Open, stream, download, edit, delete | primary key on `video` |
| Duplicate check at ingest | unique (`owner_id`, `content_hash`) |
| Search within one vault | GIN on (`owner_id`, `search_text` trigram) using `btree_gin` alongside `pg_trgm` (both trusted extensions) |
| Owner's playlists, recently updated first | `video_playlist (owner_id, updated_at DESC)` |
| Playlist contents in order | unique (`playlist_id`, `position`), deferrable and initially deferred so a reorder can renumber in one transaction |
| Which playlists hold a video, and the cascade when a video is deleted | `video_playlist_item (video_id)` |
| Upload to video foreign key | `upload (video_id)` where not null |

Deliberately not indexed: `thumbnail_key IS NULL`, `container`, `duration_ms`. Nothing filters on them yet.

**Streaming and download (ADR 0006, extended)**
- The video stream endpoint follows ADR 0006: authenticated, proxied through the API, one byte range, `416` past the end, a clean `404` if the object is missing, `Cache-Control: private`. The owner check comes first. The content type comes from the recorded container.
- The download endpoint serves the same object as an attachment under the original filename (RFC 6266 encoding for non-ASCII names). The thumbnail endpoint follows the cover endpoint's rules.

**Search (ADR 0009, extended)**
- Trigram matching over `search_text`, always filtered by owner, ranked by similarity with newest first on ties. It is its own endpoint and doesn't change the global music search.

**Playlists**
- Manual order with an integer `position`. A reorder rewrites positions in one transaction. A playlist's cover is its first video's thumbnail, with no stored cover. Opening a video from a playlist goes to the normal watch page. There is no autoplay or "next in playlist" in this spec.

**API contract (ADR 0003)**
- Written in the contract first, then the web types are regenerated. New groups: videos (list with cursor, get, edit, delete, search), stream, download, thumbnail (get and put with metadata), and video playlists (list, create, rename, delete, get with items, add item, remove item, reorder). The upload create request gains `kind`, and the response's part size is the scaled one.

**Frontend**
- Routes: `/videos` (Vault and Playlists tabs, search box, Upload button), `/watch/[id]`, `/videos/playlists/[id]`. A Videos item in the sidebar and in mobile navigation.
- The watch page uses a plain `<video>` element with native controls, owned by the page and not by the root layout. Starting playback pauses the music engine. A media error swaps the player for the "can't play in this browser" panel with Download original.
- Styling uses the existing tokens from DESIGN.md. Thumbnails are 16:9.

## Testing Decisions

- A good test drives the system from its public edge (HTTP for the API, the rendered UI for the web) and checks what a user or client can observe: status codes, response bodies, what's in the store, what's on screen. Tests don't reach into private classes or assert on SQL.
- **Seam 1: backend HTTP API against real Postgres and a real S3-compatible store (Testcontainers).** Prior art: `IngestFlowTest`, `IngestHardeningTest`, `StreamTest`, `FavoritesApiTest`, `SearchApiTest`, with `StoreClient` to look in the store. It covers:
  - upload, ingest and `DONE`; magic-byte rejection; per-user duplicates
  - stream ranges and `416`; download headers and bytes matching the upload exactly
  - thumbnail save and serve; edit; delete with the prefix gone from the store
  - playlists including reorder and cascades; search
  - **privacy**: a second user, and an admin, get `404` on every video and playlist endpoint
- Fixture videos are a few KB built in test code with a valid `ftyp` or EBML header. No real media and no ffmpeg, so CI doesn't need ffmpeg.
- **Seam 2: web features with Vitest, Testing Library and MSW.** Prior art: `upload.test.tsx`, `browse.test.tsx`, `search.test.tsx`, `favorites.test.tsx`. It covers:
  - the vault grid, empty state and paging; video upload with progress and the thumbnail save after `DONE`
  - the watch page; the can't-play panel; music pausing on play
  - edit and delete; the search filter; playlists
- **Seam 3 (new): the frame grabber** sits behind a small module boundary and is faked in feature tests, the same way `fakeAudio.ts` stands in for the audio element (jsdom can't decode video). The real grabber is checked by hand in a browser with an MP4, a WebM and an MKV.
- Pure unit tests only for the part-size calculation and the magic-byte check.

## Out of Scope

- ffmpeg or ffprobe on the server, transcoding, remuxing, HLS/DASH, adaptive bitrate.
- Movies, shows, seasons, episodes, filename parsing, external metadata.
- Subtitles of any kind.
- Watch progress, resume, watched markers, history, Continue watching, Explore rows.
- Sharing videos with other users, public links, per-video visibility.
- Admin access to other users' vaults.
- Autoplay or "next" within a playlist; a video appearing twice in one playlist.
- A trash bin or undo for deletes.
- Integrity verification tooling beyond the stored SHA-256.
- Storing identical files once across users.
- Videos in global search, favorites or playback events.
- **Folder import** (pointing the server or a CLI at a folder on disk). It's the next piece of work and needs its own design session first. The thumbnail backfill on first watch is what makes imported videos get thumbnails without ffmpeg.

## Further Notes

- This replaces the earlier spec 03 (movies and shows, on the unmerged `video-library` branch). That branch is kept as a reference and not merged. Ingest code worth reusing (streaming hash, multipart handshake changes) can be read there.
- Spec 01 lists "private per-user libraries" and "download" as out of scope for music. That still holds for music. The vault is private and downloadable by design.
- Disk: originals are kept forever, so the README should note that the vault's size is the size of what you upload.
