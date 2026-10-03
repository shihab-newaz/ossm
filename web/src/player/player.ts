import { useSyncExternalStore } from "react";
import type { components } from "@/api/schema";
import { toast } from "@/components/ui/toast";

type Track = components["schemas"]["Track"];
export type PlayerTrack = Pick<Track, "id" | "title" | "artist" | "durationMs"> & Partial<Pick<Track, "album" | "coverUrl">>;

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export type PlayerState = {
  track: PlayerTrack | null;
  status: PlayerStatus;
  /** Seconds. */
  currentTime: number;
  /** Seconds: what the browser reports once it knows, the library's figure until then. */
  duration: number;
  volume: number;
  muted: boolean;
};

/** The part of HTMLAudioElement the player uses, so tests can drive it without a browser. */
export interface AudioLike extends EventTarget {
  src: string;
  currentTime: number;
  readonly duration: number;
  volume: number;
  muted: boolean;
  readonly paused: boolean;
  readonly error: { code: number } | null;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
}

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

type Options = {
  audio?: () => AudioLike;
  /** Where errors go. The app wires this to a toast. */
  notify?: (message: string) => void;
  /** Remembers the volume. Null for none; defaults to localStorage when there is one. */
  storage?: KeyValueStore | null;
};

const VOLUME_KEY = "ossm.volume";
const MEDIA_ERR_NETWORK = 2;

export const streamUrl = (trackId: string) => `/api/v1/tracks/${trackId}/stream`;

function defaultStorage(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function savedVolume(storage: KeyValueStore | null): number {
  try {
    const value = Number(storage?.getItem(VOLUME_KEY));
    if (storage?.getItem(VOLUME_KEY) != null && Number.isFinite(value)) return Math.min(1, Math.max(0, value));
  } catch {
    // Storage can be blocked; fall through to the default.
  }
  return 1;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The one audio element for the whole app and the state around it. Lives outside React so playback
 * survives navigation, and so it can be tested with a fake element.
 */
export function createPlayer(options: Options = {}) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const notify = options.notify ?? ((message: string) => toast.error(message));
  const makeAudio = options.audio ?? (() => new Audio() as AudioLike);

  let state: PlayerState = { track: null, status: "idle", currentTime: 0, duration: 0, volume: savedVolume(storage), muted: false };
  let element: AudioLike | null = null;
  const listeners = new Set<() => void>();

  function set(patch: Partial<PlayerState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }

  function fail(track: PlayerTrack, code?: number) {
    set({ status: "error" });
    notify(
      code === MEDIA_ERR_NETWORK
        ? `Lost the connection while playing “${track.title}”. Press play to try again.`
        : `“${track.title}” couldn't be played. Press play to try again.`,
    );
  }

  function audio(): AudioLike {
    if (element) return element;
    const a = makeAudio();
    a.volume = state.volume;
    a.muted = state.muted;
    a.addEventListener("playing", () => set({ status: "playing" }));
    a.addEventListener("pause", () => {
      if (state.status === "playing" || state.status === "loading") set({ status: "paused" });
    });
    // Buffering mid-track: show it, then "playing" brings it back.
    a.addEventListener("waiting", () => {
      if (state.status === "playing") set({ status: "loading" });
    });
    a.addEventListener("timeupdate", () => set({ currentTime: a.currentTime }));
    const durationKnown = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) set({ duration: a.duration });
    };
    a.addEventListener("durationchange", durationKnown);
    a.addEventListener("loadedmetadata", durationKnown);
    a.addEventListener("ended", () => {
      a.currentTime = 0;
      set({ status: "paused", currentTime: 0 });
    });
    a.addEventListener("error", () => {
      if (state.track) fail(state.track, a.error?.code);
    });
    element = a;
    return a;
  }

  async function start(a: AudioLike) {
    const track = state.track;
    try {
      await a.play();
    } catch (e) {
      // The user moved on to another track while this one was starting.
      if (state.track !== track || !track) return;
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") return;
      // The browser wants a click before it plays sound: wait for one instead of calling it a failure.
      if (name === "NotAllowedError") set({ status: "paused" });
      else fail(track);
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    /** Plays this track; if it is already loaded, carries on from where it was. */
    async play(track: PlayerTrack) {
      const a = audio();
      if (state.track?.id === track.id && state.status !== "error") {
        if (state.status === "paused") await start(a);
        return;
      }
      a.src = streamUrl(track.id);
      a.load();
      set({ track, status: "loading", currentTime: 0, duration: track.durationMs / 1000 });
      await start(a);
    },

    pause() {
      element?.pause();
    },

    /** Play/pause for the player bar. After a failure it reloads the track, so nothing stays stuck. */
    async toggle() {
      const track = state.track;
      if (!track) return;
      if (state.status === "playing" || state.status === "loading") {
        element?.pause();
        set({ status: "paused" });
      } else if (state.status === "error") {
        await this.play(track);
      } else {
        await start(audio());
      }
    },

    seek(seconds: number) {
      if (!state.track) return;
      const target = clamp(seconds, 0, state.duration);
      audio().currentTime = target;
      set({ currentTime: target });
    },

    setVolume(volume: number) {
      const level = clamp(volume, 0, 1);
      audio().volume = level;
      audio().muted = false;
      set({ volume: level, muted: false });
      try {
        storage?.setItem(VOLUME_KEY, String(level));
      } catch {
        // Remembering the level is a convenience, not a requirement.
      }
    },

    setMuted(muted: boolean) {
      audio().muted = muted;
      set({ muted });
    },

    /** Empties the player, for example on logout. */
    stop() {
      if (element) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
      set({ track: null, status: "idle", currentTime: 0, duration: 0 });
    },
  };
}

export type Player = ReturnType<typeof createPlayer>;

export const player = createPlayer();

export function usePlayer(): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getState, player.getState);
}
