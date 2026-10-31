# 25: Video playlists

**Parent:** docs/specs/03-video-vault.md
**Status:** ready-for-agent
**Blocked by:** 20

## What to build

The owner can group videos into private, ordered **video playlists**. The Videos page gets a Playlists tab listing their playlists, recently updated first, each with a cover taken from its first video's thumbnail (placeholder otherwise). A playlist page lists its videos in order, and each one opens the normal watch page (no autoplay). From the watch page, an "Add to playlist" menu shows the user's playlists with checkmarks for the ones that already hold this video. The user can create, rename and delete playlists, remove a video from one, and reorder its videos.

Behind it: the playlist migration (`V10`) with `video_playlist` and `video_playlist_item` and the indexes the spec assigns to them. That includes the deferrable unique (`playlist_id`, `position`) so a reorder renumbers in one transaction, and the `video_id` index that serves "which playlists hold this video" and the cascade.

## Acceptance criteria

- [ ] API test: create, rename and delete a playlist. Deleting a playlist leaves its videos in the vault.
- [ ] API test: adding a video appends it, adding it again changes nothing, removing it closes the gap, and reorder persists the new order.
- [ ] API test: deleting a video removes it from every playlist.
- [ ] API test: a user can't add someone else's video to their playlist, and another user and an admin get `404` on every playlist endpoint.
- [ ] Web test: the Playlists tab, the playlist page in order, Add to playlist with checkmarks, remove, and reorder.
- [ ] The cover shows the first video's thumbnail, or a placeholder.
