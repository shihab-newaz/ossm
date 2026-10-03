# 7. The player engine lives outside React, with two audio elements

Status: accepted

## Context

Playback has to survive page navigation, be restorable after a reload, and be testable without a browser (jsdom cannot play media). The queue needs shuffle, repeat, reordering and near-gapless changes between tracks.

## Decision

- The engine is a plain TypeScript module (`player/player.ts`) with `getState`/`subscribe`, read in React through `useSyncExternalStore`. Nothing about playback is held in a component, so it is unaffected by navigation, remounts and React strict mode. The server and the hydration pass see an idle player, and a restored queue appears right after, so there is no hydration mismatch. (The spec mentions Zustand; a store this size did not need the dependency.)
- The audio elements sit behind a small `AudioLike` interface and are created through a factory, so tests drive the engine with fake elements that fire the same events a browser would.
- Two elements are used. One plays; as soon as it is playing, the other loads the next track (`preload="auto"`). When a track ends on its own the preloaded element takes over, so the change is near-gapless, but it is not sample-accurate: there is still the small gap of one `ended` event and a `play()` call. A preload that fails is ignored and the track is loaded normally when its turn comes.
- Queue entries have their own ids, so the same track can be queued twice and removed one at a time. The queue is held in play order. Shuffle permutes it once (current track first, so every track plays once per cycle), remembers the original order, and switching it off restores that order around the current track. When repeat all wraps a shuffled queue it reshuffles for the next cycle and never opens with the track that just played.
- "Previous" restarts the track after 3 seconds, as players usually do. At the end of the queue with repeat off, playback stops on the last track and can be started again. Repeat one repeats on its own, but the next button still moves on.
- The queue, position, shuffle and repeat are saved to `localStorage` (`ossm.player`): on every structural change and pause, and every 5 seconds of playback. They come back paused, and nothing is loaded until play is pressed, so reloading never starts a download or sound. Saved data is validated and ignored if malformed. Only the fields the player shows are stored, not whole library records.
- Signing out (or a 401) stops the player and clears the saved queue, so the next person on the same browser does not inherit it. This is done by the auth gate rather than on unmount, because React strict mode would unmount and clear a freshly restored queue in development.
- The Media Session API (`player/mediaSession.ts`) shows title, artist, album and artwork and routes media keys, seeking and previous/next back to the engine.
- Keyboard shortcuts (`player/keymap.ts`) are ignored while typing in a form control, with Ctrl/Cmd/Alt held, and Space is left alone on elements that already use it (buttons, links).

## Consequences

Not verified in a real browser: how smooth the gap really is, Safari/iOS behaviour for a second element that was never started by a user gesture, and the OS media controls. The tests cover the logic with fake elements and a fake media session.

The queue drawer reorders with up/down buttons rather than dragging. That is keyboard accessible, and drag and drop can be added without changing the engine (`move(from, to)`).

The "L" (like) shortcut is not wired because there is nothing to like until favorites exist (ticket 13).
