# 08: Queue and full player

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** in-review (code and tests done; two criteria need a manual check, see the last comments)
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

- [x] Albums play track to track with the next track preloaded before the current one ends.
- [x] Shuffle never repeats a track before all have played in a cycle; repeat one/all/off behave as labeled.
- [x] Reordering and removing in the queue updates what plays next; "play next" inserts after the current track.
- [x] Reloading the page restores the queue and position, paused.
- [ ] OS media keys and lock-screen controls work and show title, artist and artwork.
- [ ] Every listed keyboard shortcut works and is listed in the help dialog; shortcuts do not fire while typing in an input.
- [x] Queue and player logic have behavior-level Vitest tests (next/previous, shuffle, repeat, persistence and restore) using the MSW mock.
- [x] All drawer and dialog controls are keyboard navigable with visible focus.

## Comments

- Real-audio test library: `H:\AUDIO` on the dev machine (local only, not in the repo, and the files are not to be copied into it). Use it for manual and exploratory checks of this ticket. Automated tests should keep generating small fixture files instead.
- Built (ADR 0007): queue drawer (up/down buttons rather than dragging, so it is keyboard accessible), previous/next, shuffle, repeat off/all/one, a second audio element that preloads the next track, queue and position saved to localStorage and restored paused, Media Session, keyboard shortcuts and a "?" help dialog, Play all / Shuffle all and per-row "Play next" / "Add to queue" in the library. 164 web tests pass (the engine is tested with fake audio elements, because jsdom cannot play media; mutation checks confirmed the shuffle and preload tests fail when the behaviour is broken).
- NOT checked off, and why:
  - *Every listed keyboard shortcut works*: Space, arrows, Shift+arrows, M, "/" (focuses the top bar search) and "?" work and are in the help dialog. **L (like) is not wired** because there is nothing to like until favorites exist; ticket 13 should add it to `player/keymap.ts` (the key handler and the `SHORTCUTS` list the help dialog shows).
  - *OS media keys and lock-screen controls*: implemented and tested against a fake `mediaSession`, but never tried on a real OS.
- Also unverified in a real browser: how smooth the track change really is, and Safari/iOS behaviour for the second audio element (it is never started by a user gesture, which iOS can refuse). Worth a listen to an album at http://localhost:8080/library: Play all, let a track end, and check the gap.
- Not in this ticket: the full-screen player and swipe-down mini-player (spec items 54 and 55, they belong with ticket 15); the queue button is hidden below the lg breakpoint for now. Playlist and album "play"/"shuffle" actions should call `player.playList(tracks, start, { shuffle, randomStart })` when tickets 10 and 14 add those screens.
