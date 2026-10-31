import { useSyncExternalStore } from "react";

export type VideoStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export type VideoState = {
  status: VideoStatus;
  /** Seconds. */
  currentTime: number;
  /** Seconds: the library's figure until the browser knows better. */
  duration: number;
  volume: number;
  muted: boolean;
  /** Playing, but waiting for data. */
  buffering: boolean;
};

/** The part of HTMLVideoElement the engine uses, so tests can drive it without a browser. */
export interface MediaLike extends EventTarget {
  src: string;
  currentTime: number;
  readonly duration: number;
  volume: number;
  muted: boolean;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
}

type Options = {
  /** Called whenever a video starts, so music can stop: two things never play at once. */
  onStart?: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * One video at a time, for the watch page (ADR 0007's shape, without a queue). React reads it with
 * {@link useVideoState}; the element is attached once it is on the page.
 */
export function createVideoEngine(options: Options = {}) {
  let el: MediaLike | null = null;
  let detachListeners: (() => void) | null = null;
  let pendingStart = 0;
  let state: VideoState = { status: "idle", currentTime: 0, duration: 0, volume: 1, muted: false, buffering: false };
  const listeners = new Set<() => void>();

  function set(patch: Partial<VideoState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  }

  function listen(media: MediaLike) {
    const handlers: [string, () => void][] = [
      ["playing", () => set({ status: "playing", buffering: false })],
      ["pause", () => state.status !== "ended" && state.status !== "error" && set({ status: "paused", buffering: false })],
      ["waiting", () => set({ buffering: true })],
      ["timeupdate", () => set({ currentTime: media.currentTime })],
      ["durationchange", () => Number.isFinite(media.duration) && media.duration > 0 && set({ duration: media.duration })],
      [
        "loadedmetadata",
        () => {
          if (Number.isFinite(media.duration) && media.duration > 0) set({ duration: media.duration });
          if (pendingStart > 0) {
            media.currentTime = pendingStart;
            set({ currentTime: pendingStart });
            pendingStart = 0;
          }
        },
      ],
      ["ended", () => set({ status: "ended", buffering: false, currentTime: state.duration || media.currentTime })],
      ["error", () => set({ status: "error", buffering: false })],
    ];
    handlers.forEach(([type, fn]) => media.addEventListener(type, fn));
    return () => handlers.forEach(([type, fn]) => media.removeEventListener(type, fn));
  }

  async function play() {
    if (!el || !el.src) return;
    options.onStart?.();
    if (state.status !== "playing") set({ status: "loading" });
    try {
      await el.play();
    } catch (error) {
      // Autoplay refused: wait for a press. Anything else means the file cannot play here.
      set({ status: (error as Error)?.name === "NotAllowedError" ? "paused" : "error", buffering: false });
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    attach(media: MediaLike) {
      detachListeners?.();
      el = media;
      media.volume = state.volume;
      media.muted = state.muted;
      detachListeners = listen(media);
    },
    detach() {
      el?.pause();
      detachListeners?.();
      detachListeners = null;
      el = null;
    },

    /** Loads a file, starting at a position in seconds. Plays straight away unless asked not to. */
    async load(src: string, opts: { startAt?: number; durationSeconds?: number; autoplay?: boolean } = {}) {
      if (!el) return;
      const startAt = Math.max(0, opts.startAt ?? 0);
      pendingStart = startAt;
      set({ status: "idle", currentTime: startAt, duration: opts.durationSeconds ?? 0, buffering: false });
      el.src = src;
      el.load();
      if (opts.autoplay !== false) await play();
    },

    play,
    pause() {
      el?.pause();
    },
    async toggle() {
      if (state.status === "playing" || state.status === "loading") el?.pause();
      else if (state.status === "ended") {
        this.seek(0);
        await play();
      } else await play();
    },
    seek(seconds: number) {
      if (!el) return;
      const max = state.duration > 0 ? state.duration : Number.isFinite(el.duration) ? el.duration : seconds;
      const to = clamp(seconds, 0, Math.max(0, max));
      pendingStart = 0;
      el.currentTime = to;
      set({ currentTime: to, status: state.status === "ended" ? "paused" : state.status });
    },
    skip(deltaSeconds: number) {
      this.seek(state.currentTime + deltaSeconds);
    },
    setVolume(volume: number) {
      const v = clamp(volume, 0, 1);
      if (el) {
        el.volume = v;
        el.muted = v === 0 ? el.muted : false;
      }
      set({ volume: v, muted: v === 0 ? state.muted : false });
    },
    setMuted(muted: boolean) {
      if (el) el.muted = muted;
      set({ muted });
    },
  };
}

export type VideoEngine = ReturnType<typeof createVideoEngine>;

export function useVideoState(engine: VideoEngine): VideoState {
  return useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
}
