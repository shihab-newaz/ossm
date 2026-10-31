# 20: Upload a video and see it in my vault

**Parent:** docs/specs/03-video-vault.md
**Status:** ready-for-agent
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

- [ ] API test: uploading a small MP4 fixture (a valid `ftyp` header built in code) ends `DONE`, and the vault list returns it with its title, container and size.
- [ ] API test: a file with a `.mp4` name but non-video bytes ends `FAILED` with a readable reason and can be retried like audio.
- [ ] API test: uploading the same bytes twice as the same user ends `DUPLICATE`, pointing at the first video, and the second object is gone from the store (checked with `StoreClient`).
- [ ] API test: the same bytes uploaded by a different user become a separate video.
- [ ] API test: a second user's and an admin's vault lists don't include the first user's videos.
- [ ] API test: the vault list pages by cursor, newest first, with stable order when timestamps tie.
- [ ] Web test: the Videos page shows an empty state, uploads files with progress, and then shows the tiles. A failed upload shows its reason and a retry button.
- [ ] A Videos entry exists in the sidebar and in mobile navigation.
- [ ] Glossary terms from the spec are used in code and UI copy (vault, video, original).
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, and the backend suite passes without ffmpeg installed.
