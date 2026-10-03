import type { Player } from "./player";

type Details = { seekTime?: number | null; seekOffset?: number | null };

/** The slice of navigator.mediaSession used here, so it can be faked. */
export type SessionLike = {
  metadata: unknown;
  playbackState: "none" | "paused" | "playing";
  setActionHandler(action: string, handler: ((details: Details) => void) | null): void;
  setPositionState?: (state?: { duration: number; position: number; playbackRate: number }) => void;
};

type MetadataInit = { title: string; artist: string; album: string; artwork: { src: string; sizes: string; type?: string }[] };

const SEEK_STEP_SECONDS = 10;

/**
 * Shows what is playing on the lock screen and in the OS media controls, and routes media keys back
 * to the player. Returns a function that detaches it again.
 */
export function attachMediaSession(
  player: Player,
  maybeSession: SessionLike | undefined = typeof navigator === "undefined" ? undefined : (navigator.mediaSession as SessionLike | undefined),
  makeMetadata: (init: MetadataInit) => unknown = (init) => new MediaMetadata(init),
  baseUrl: string = typeof window === "undefined" ? "http://localhost/" : window.location.href,
): () => void {
  if (!maybeSession) return () => {};
  const session: SessionLike = maybeSession;

  const handlers: Record<string, (details: Details) => void> = {
    play: () => void player.resume(),
    pause: () => player.pause(),
    previoustrack: () => void player.previous(),
    nexttrack: () => void player.next(),
    seekto: (d) => {
      if (typeof d.seekTime === "number") player.seek(d.seekTime);
    },
    seekbackward: (d) => player.seek(player.getState().currentTime - (d.seekOffset ?? SEEK_STEP_SECONDS)),
    seekforward: (d) => player.seek(player.getState().currentTime + (d.seekOffset ?? SEEK_STEP_SECONDS)),
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // Not every browser supports every action.
    }
  }

  let shownTrack: string | null = null;
  function update() {
    const { track, status, currentTime, duration } = player.getState();
    if (!track) {
      session.metadata = null;
      session.playbackState = "none";
      shownTrack = null;
      return;
    }
    if (shownTrack !== track.id) {
      shownTrack = track.id;
      session.metadata = makeMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album ?? "",
        // Cover art is same-origin and needs the login cookie, which the OS fetches as the browser.
        artwork: track.coverUrl ? [{ src: new URL(track.coverUrl, baseUrl).href, sizes: "512x512" }] : [],
      });
    }
    session.playbackState = status === "playing" || status === "loading" ? "playing" : "paused";
    try {
      if (duration > 0) session.setPositionState?.({ duration, position: Math.min(currentTime, duration), playbackRate: 1 });
    } catch {
      // Throws on values it dislikes (for example a position past the duration while metadata loads).
    }
  }

  update();
  const unsubscribe = player.subscribe(update);
  return () => {
    unsubscribe();
    for (const action of Object.keys(handlers)) {
      try {
        session.setActionHandler(action, null);
      } catch {
        // Nothing to undo.
      }
    }
    session.metadata = null;
    session.playbackState = "none";
  };
}
