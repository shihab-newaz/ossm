# 08: Queue and full player

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** ready-for-agent
**Blocked by:** 07 (Stream and play a track)

## What to build

The player becomes a complete listening experience. The user manages a queue, plays albums smoothly, controls playback from the keyboard and the operating system, and picks up where they left off after a reload.

- Queue drawer: view, reorder, remove, "play next", "add to queue".
- Previous/next, shuffle and repeat (off, all, one).
- Near-gapless transitions by preloading the next track in a second audio element.
- Queue and position persisted to local storage and restored paused after a reload.
- Media Session API: metadata, artwork and OS media keys.
- Keyboard shortcuts (Space, arrows seek 5s, Shift+arrows previous/next, M mute, L like, "/" search) and a "?" help dialog.
- Playlist and album "play" and "shuffle" actions feed the queue.

## Acceptance criteria

- [ ] Albums play track to track with the next track preloaded before the current one ends.
- [ ] Shuffle never repeats a track before all have played in a cycle; repeat one/all/off behave as labeled.
- [ ] Reordering and removing in the queue updates what plays next; "play next" inserts after the current track.
- [ ] Reloading the page restores the queue and position, paused.
- [ ] OS media keys and lock-screen controls work and show title, artist and artwork.
- [ ] Every listed keyboard shortcut works and is listed in the help dialog; shortcuts do not fire while typing in an input.
- [ ] Queue and player logic have behavior-level Vitest tests (next/previous, shuffle, repeat, persistence and restore) using the MSW mock.
- [ ] All drawer and dialog controls are keyboard navigable with visible focus.

## Comments

- Real-audio test library: `H:\AUDIO` on the dev machine (local only, not in the repo, and the files are not to be copied into it). Use it for manual and exploratory checks of this ticket. Automated tests should keep generating small fixture files instead.
