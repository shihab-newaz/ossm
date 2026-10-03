import type { PlayerState } from "@/player/player";

/** A listen counts as a play after this many seconds of actual listening... */
export const QUALIFYING_SECONDS = 30;
/** ...or after this share of the track, whichever comes first. */
export const QUALIFYING_SHARE = 0.5;

/** How long a listener has to listen before it counts as a play: 30 seconds, or half of a shorter track. */
export function qualifyingSeconds(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return QUALIFYING_SECONDS;
  return Math.min(QUALIFYING_SECONDS, durationSeconds * QUALIFYING_SHARE);
}

export type ListenEventType = "play_started" | "play_completed" | "skipped";

export type ListenEvent = {
  type: ListenEventType;
  trackId: string;
  /** Where in the track the listener was, in milliseconds. */
  positionMs: number;
};

type PlayerView = Pick<PlayerState, "track" | "status" | "currentTime" | "duration" | "listen">;

/** Two timeupdates further apart than this are a seek (or a stall), not time spent listening. */
const MAX_STEP_SECONDS = 2;

type Listen = {
  trackId: string;
  listen: number;
  started: boolean;
  qualified: boolean;
  /** Seconds actually listened to; seeking does not add to it. */
  heard: number;
  lastTime: number;
  lastStatus: PlayerState["status"];
};

/**
 * Turns what the player does into playback events:
 *
 * - `play_started` when a track begins to sound,
 * - `play_completed` once, when the listener has heard 30 seconds or half the track (whichever is
 *   first), so jumping ahead to the middle does not count,
 * - `skipped` when the listener leaves a track that began but never reached that point.
 *
 * Pure: feed it player states, and it calls `emit`.
 */
export function createListenTracker(emit: (event: ListenEvent) => void) {
  let current: Listen | null = null;

  function end() {
    if (current?.started && !current.qualified) {
      emit({ type: "skipped", trackId: current.trackId, positionMs: Math.round(current.lastTime * 1000) });
    }
    current = null;
  }

  function update(state: PlayerView) {
    const { track } = state;
    if (current && (!track || track.id !== current.trackId || state.listen !== current.listen)) end();
    if (!track) return;
    current ??= {
      trackId: track.id,
      listen: state.listen,
      started: false,
      qualified: false,
      heard: 0,
      lastTime: state.currentTime,
      lastStatus: state.status,
    };

    const listen = current;
    const playing = state.status === "playing";
    // "Playing" arriving from anything else is the track actually sounding. Carrying a stale
    // "playing" over from the previous track while the next one loads does not count.
    if (playing && listen.lastStatus !== "playing" && !listen.started) {
      listen.started = true;
      listen.lastTime = state.currentTime;
      emit({ type: "play_started", trackId: listen.trackId, positionMs: Math.round(state.currentTime * 1000) });
    }
    if (playing && listen.started) {
      const step = state.currentTime - listen.lastTime;
      if (step > 0 && step <= MAX_STEP_SECONDS) listen.heard += step;
    }
    listen.lastTime = state.currentTime;
    listen.lastStatus = state.status;

    if (listen.started && !listen.qualified && listen.heard >= qualifyingSeconds(state.duration)) {
      listen.qualified = true;
      emit({ type: "play_completed", trackId: listen.trackId, positionMs: Math.round(state.currentTime * 1000) });
    }
  }

  return { update };
}
