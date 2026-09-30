# 14: Playlists

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** ready-for-agent
**Blocked by:** 10 (Library browsing)

## What to build

Users organize music into playlists, privately by default and optionally shared with everyone on the instance.

- Create, rename and delete playlists.
- Add tracks from anywhere (track rows, album pages, the queue) and remove them.
- Reorder tracks by drag and drop, with a keyboard-accessible alternative.
- Visibility: private by default with a toggle to make a playlist visible to everyone on this instance (read-only for others).
- Sidebar lists the user's playlists with 40px thumbnails; a playlist page with hero header, play/shuffle and the track list.
- Backend: playlist endpoints authored in OpenAPI first, with ownership and visibility enforced server-side.

## Acceptance criteria

- [ ] A user can create, rename, delete and populate a playlist, and the order persists.
- [ ] Drag reorder and the keyboard alternative both persist the new order.
- [ ] A private playlist is invisible to other users (API test); a shared one is readable but not editable by them.
- [ ] Deleting a track from the library removes it from playlists without breaking them.
- [ ] Playlists appear in the sidebar with thumbnails and update without a reload.
- [ ] UI tests cover create, add, reorder (pointer and keyboard), and the visibility toggle against the MSW mock.
