# 20: Upload a video and see it in my vault

**Parent:** docs/specs/03-video-vault.md
**Status:** in-review (code and tests done and the new `V9` is live on the dev DB; the Videos page needs a look in a real browser)
**Blocked by:** 19

## What to build

The first end-to-end slice of the vault. A user opens **Videos** in the sidebar, uploads one or more video files, watches per-file progress, and sees them appear in a grid of their own videos, newest first, each with a placeholder thumbnail and its title (the filename without extension). Another user sees an empty vault.

Behind it:
- The vault migration (`V9`): the `video` table, `upload.kind` and `upload.video_id` (cascade), the exactly-one CHECK, the indexes the spec assigns to the vault grid, duplicate check, search and upload FK, and `btree_gin`. Playlist tables are not part of this ticket.
- Video ingest: magic bytes (`ftyp` / EBML) decide the container. SHA-256 with a streaming read. A `video` row whose id is the upload id, with the object at `video/<owner_id>/<video_id>/original.<ext>`. A per-owner duplicate ends `DUPLICATE`, pointing at the existing video.
- The **object-deletion job** on db-scheduler (delete a prefix, retry until the store confirms), first used here to remove a duplicate upload's object.
- The vault list endpoint, scoped to the owner, with keyset paging.

**Dev DB:** the dev database already has the old branch's `V9` applied. Before running the new migration there, re-check that the old video tables are empty and **ask the owner for explicit approval**. Then drop them, undo the old upload changes, delete the `V9` row from `flyway_schema_history`, and let the new `V9` apply. Never touch music data. See the memory note on never wiping the dev DB.

## Acceptance criteria

- [x] API test: uploading a small MP4 fixture (a valid `ftyp` header built in code) ends `DONE`, and the vault list returns it with its title, container and size.
- [x] API test: a file with a `.mp4` name but non-video bytes ends `FAILED` with a readable reason and can be retried like audio.
- [x] API test: uploading the same bytes twice as the same user ends `DUPLICATE`, pointing at the first video, and the second object is gone from the store (checked with `StoreClient`).
- [x] API test: the same bytes uploaded by a different user become a separate video.
- [x] API test: a second user's and an admin's vault lists don't include the first user's videos.
- [x] API test: the vault list pages by cursor, newest first, with stable order when timestamps tie.
- [x] Web test: the Videos page shows an empty state, uploads files with progress, and then shows the tiles. A failed upload shows its reason and a retry button.
- [x] A Videos entry exists in the sidebar and in mobile navigation.
- [x] Glossary terms from the spec are used in code and UI copy (vault, video, original).
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, and the backend suite passes without ffmpeg installed.

## Comments
- Built, contract first. New: `GET /api/v1/videos` (`limit`, `cursor`; response `{items, nextCursor}`), and `kind` is now accepted for real on `POST /api/v1/uploads` (the "not available yet" refusal from 19 is gone). `Upload` gained `videoId`. Migration `V9__video_vault.sql` has the `video` table, `upload.kind` and `upload.video_id` (cascade), the DONE/DUPLICATE exactly-one CHECK, the vault-grid, search and upload-FK indexes, and `btree_gin`.
- Ingest: `VideoIngest` reads the object once from the store: the first 128 bytes decide the container (`VideoSniffer`, `ftyp` or EBML with its DocType), and the whole stream feeds SHA-256. Nothing is written to disk, so a 20 GB file costs no scratch space. The video row's id is the upload id. Size is what was counted while streaming, not what the browser declared.
- Object deletion: `ObjectDeletionQueue` writes a row into db-scheduler's own `scheduled_tasks` table, named by the prefix, with the caller's connection. That is what makes "in the same transaction" real: the DUPLICATE status and the deletion request commit together (db-scheduler's own `schedule()` would have used a second connection). The job (`delete-prefix`, run by the existing scheduler) lists the prefix, deletes in batches, lists again, and only counts as done when the listing is empty; it backs off up to 30 minutes and never gives up. `VideoIngest.prefixOf` refuses any key outside `video/<owner>/<video>/`, since it feeds a delete.
- Privacy beyond the vault list: the admin "Failed uploads" list now shows music only. It listed every user's failed uploads by file name, which would have leaked a vault's file names to admins.
- Web: `/videos` with a grid of 16:9 placeholder tiles (title, container and size), an empty state, drop or choose files, per-file progress and retry, and a "Show more videos" button that also fires when scrolled into view. Videos is in the sidebar and in the mobile tab bar (now five tabs). The per-file queue and its status lines were pulled out of `UploadScreen` into `upload/UploadQueue.tsx` and are shared; music behaves as before and only the copy differs ("Added to your vault.").
- Tests: 12 in `VideoVaultTest` (every criterion above, plus the container coming from the bytes, an MP3 sent as video failing, `401`, a video landing mid-read not shifting a cursor, bad limits and cursors, and admins not seeing video failures), 4 in `VideoSnifferTest`, 13 web tests in `videos.test.tsx`. `IngestGiveUpTest` needed a real track under its DONE/DUPLICATE rows now that the database insists on a target. Full backend suite 190 tests, web 277.
- Not done here: the tile has no thumbnail, duration or link (tickets 21 and 22), and nothing has been looked at in a real browser.
- **Dev DB swap, done 2026-11-07 with the owner's explicit approval.** The dev database had the old branch's `V9` (`video library`) applied. A read-only check first showed `video`, `video_show`, `subtitle` and `watch_progress` empty and no upload row pointing at a video. One transaction, guarded by a row-count check, then dropped those four tables and the old `upload.kind` and `upload.video_id` columns and deleted the `V9` history row. Before and after: 1 user, 2 tracks, 2 uploads, unchanged. The compose stack was rebuilt and the new `V9` (`video vault`) applied cleanly; `/api/v1/videos` answers 401 without a login. No videos were uploaded to the dev DB.
