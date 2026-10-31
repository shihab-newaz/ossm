# 23: Edit and delete a video

**Parent:** docs/specs/03-video-vault.md
**Status:** ready-for-agent
**Blocked by:** 20

## What to build

On the watch page the owner can edit a video's title and description, and delete the video after a confirmation dialog. Deleting removes the row (its upload rows go with it by cascade) and enqueues the object-deletion job from ticket 20 in the same transaction, which removes the whole `video/<owner_id>/<video_id>/` prefix (original and thumbnail) and retries until the store confirms. After deleting, the user lands back on the vault.

## Acceptance criteria

- [ ] API test: editing the title and description is reflected in detail and list. An empty title is rejected. `updated_at` changes.
- [ ] API test: deleting a video makes it `404` and removes it from the list, and the store no longer has any object under its prefix (wait on observable state, no fixed sleeps).
- [ ] API test: the object-deletion job survives a restart before it runs (prior art: `IngestSurvivesRestartTest`).
- [ ] API test: another user and an admin get `404` on edit and delete, and the video is unchanged.
- [ ] Web test: edit saves and updates the page. Delete needs confirmation, then returns to the vault without the video.
