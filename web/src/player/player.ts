import { useSyncExternalStore } from "react";
import { toast } from "@/components/ui/toast";
import { moved, nextIndex, reshuffled, shuffled, type PlayerTrack, type QueueItem, type Repeat } from "./queue";

export type { PlayerTrack, QueueItem, Repeat } from "./queue";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export type PlayerState = {
  /** The current track: `queue[index]`, or null when the queue is empty. */
  track: PlayerTrack | null;
  /** The play order. With shuffle on this is the shuffled order. */
  queue: QueueItem[];
  index: number;
  shuffle: boolean;
  repeat: Repeat;
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
  preload?: string;
  readonly paused: boolean;
  readonly error: { code: number } | null;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
}

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

type Options = {
  /** Called once for the playing element and once more for the one that preloads the next track. */
  audio?: () => AudioLike;
  /** Where errors go. The app wires this to a toast. */
  notify?: (message: string) => void;
  /** Remembers the volume, queue and position. Null for none; defaults to localStorage when there is one. */
  storage?: KeyValueStore | null;
  random?: () => number;
};

const VOLUME_KEY = "ossm.volume";
const PLAYER_KEY = "ossm.player";
const MEDIA_ERR_NETWORK = 2;
/** "Previous" restarts the track if it is further in than this, like every player. */
const RESTART_AFTER_SECONDS = 3;
/** How often the position is written while playing. */
const SAVE_EVERY_SECONDS = 5;

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
    const raw = storage?.getItem(VOLUME_KEY);
    const value = Number(raw);
    if (raw != null && Number.isFinite(value)) return Math.min(1, Math.max(0, value));
  } catch {
    // Storage can be blocked; fall through to the default.
  }
  return 1;
}

type Saved = { queue: QueueItem[]; index: number; original: string[] | null; shuffle: boolean; repeat: Repeat; time: number };

const isTrack = (t: unknown): t is PlayerTrack => {
  const track = t as PlayerTrack | null;
  return !!track && typeof track.id === "string" && typeof track.title === "string" && typeof track.artist === "string" && typeof track.durationMs === "number";
};

/** What a previous visit left behind, or null if there is nothing usable (bad data is ignored, never trusted). */
function restore(storage: KeyValueStore | null): Saved | null {
  try {
    const raw = storage?.getItem(PLAYER_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    const valid =
      Array.isArray(s.queue) &&
      s.queue.length > 0 &&
      s.queue.every((item) => typeof item?.qid === "string" && isTrack(item.track)) &&
      Number.isInteger(s.index) &&
      s.index >= 0 &&
      s.index < s.queue.length;
    if (!valid) return null;
    return {
      queue: s.queue,
      index: s.index,
      original: Array.isArray(s.original) ? s.original.filter((q) => typeof q === "string") : null,
      shuffle: s.shuffle === true,
      repeat: s.repeat === "all" || s.repeat === "one" ? s.repeat : "off",
      time: Number.isFinite(s.time) && s.time >= 0 ? s.time : 0,
    };
  } catch {
    return null;
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Only what the player shows and plays, so a whole library record is not copied into every queue entry. */
const slim = (t: PlayerTrack): PlayerTrack => ({ id: t.id, title: t.title, artist: t.artist, album: t.album, coverUrl: t.coverUrl, durationMs: t.durationMs });

/**
 * The audio for the whole app, its queue, and the state around it. Lives outside React so playback
 * survives navigation, and so it can be tested with fake audio elements.
 *
 * Two elements are used: one plays, the other loads the next track so the change is near-gapless.
 */
export function createPlayer(options: Options = {}) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const notify = options.notify ?? ((message: string) => toast.error(message));
  const makeAudio = options.audio ?? (() => new Audio() as AudioLike);
  const random = options.random ?? Math.random;

  const saved = restore(storage);
  // The order the queue had before shuffling, to go back to when shuffle is switched off.
  let original: string[] | null = saved?.shuffle ? (saved.original ?? saved.queue.map((i) => i.qid)) : null;
  let state: PlayerState = {
    track: saved ? saved.queue[saved.index].track : null,
    queue: saved?.queue ?? [],
    index: saved?.index ?? -1,
    shuffle: saved?.shuffle ?? false,
    repeat: saved?.repeat ?? "off",
    // A restored queue waits, paused, for the user to press play.
    status: saved ? "paused" : "idle",
    currentTime: saved?.time ?? 0,
    duration: saved ? saved.queue[saved.index].track.durationMs / 1000 : 0,
    volume: savedVolume(storage),
    muted: false,
  };

  const elements: AudioLike[] = [];
  let activeIdx = 0;
  /** Which queue entry the playing element currently holds (null until something is loaded into it). */
  let loadedQid: string | null = null;
  /** Which queue entry the other element has preloaded. */
  let preloaded: string | null = null;
  let lastSaved = state.currentTime;
  let counter = 0;
  const idBase = Date.now().toString(36);
  const listeners = new Set<() => void>();

  const current = () => state.queue[state.index] ?? null;
  const newItem = (track: PlayerTrack): QueueItem => ({ qid: `${idBase}-${counter++}`, track: slim(track) });

  function persist() {
    lastSaved = state.currentTime;
    try {
      storage?.setItem(
        PLAYER_KEY,
        JSON.stringify({ queue: state.queue, index: state.index, original, shuffle: state.shuffle, repeat: state.repeat, time: state.currentTime }),
      );
    } catch {
      // Remembering the queue is a convenience, not a requirement.
    }
  }

  function set(patch: Partial<Omit<PlayerState, "track">>) {
    state = { ...state, ...patch };
    state.track = current()?.track ?? null;
    listeners.forEach((listener) => listener());
    const structural = "queue" in patch || "index" in patch || "shuffle" in patch || "repeat" in patch || "status" in patch;
    if (structural || Math.abs(state.currentTime - lastSaved) >= SAVE_EVERY_SECONDS) persist();
  }

  function fail(track: PlayerTrack, code?: number) {
    set({ status: "error" });
    notify(
      code === MEDIA_ERR_NETWORK
        ? `Lost the connection while playing “${track.title}”. Press play to try again.`
        : `“${track.title}” couldn't be played. Press play to try again.`,
    );
  }

  function create(): AudioLike {
    const a = makeAudio();
    a.volume = state.volume;
    a.muted = state.muted;
    // Only the playing element speaks for the player; the preloading one is silent until it takes over.
    const on = (type: string, handler: () => void) => a.addEventListener(type, () => elements[activeIdx] === a && handler());
    on("playing", () => {
      set({ status: "playing" });
      preloadNext();
    });
    on("pause", () => {
      if (state.status === "playing" || state.status === "loading") set({ status: "paused" });
    });
    // Buffering mid-track: show it, then "playing" brings it back.
    on("waiting", () => {
      if (state.status === "playing") set({ status: "loading" });
    });
    on("timeupdate", () => set({ currentTime: a.currentTime }));
    const durationKnown = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) set({ duration: a.duration });
    };
    on("durationchange", durationKnown);
    on("loadedmetadata", durationKnown);
    on("ended", () => void ended(a));
    on("error", () => {
      if (state.track) fail(state.track, a.error?.code);
    });
    return a;
  }

  function audio(): AudioLike {
    elements[0] ??= create();
    return elements[activeIdx];
  }

  function standby(): AudioLike {
    const i = 1 - activeIdx;
    elements[i] ??= create();
    return elements[i];
  }

  async function start(a: AudioLike) {
    const item = current();
    try {
      await a.play();
    } catch (e) {
      // The user moved on to another track while this one was starting.
      if (!item || current()?.qid !== item.qid) return;
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") return;
      // The browser wants a click before it plays sound: wait for one instead of calling it a failure.
      if (name === "NotAllowedError") set({ status: "paused" });
      else fail(item.track);
    }
  }

  /** The entry that plays when this one ends on its own, or null if nothing is lined up (or shuffle will reshuffle). */
  function upcoming(): QueueItem | null {
    if (state.repeat === "one") return null;
    const i = state.index + 1;
    if (i < state.queue.length) return state.queue[i];
    return state.repeat === "all" && !state.shuffle && state.queue.length > 1 ? state.queue[0] : null;
  }

  function clearPreload() {
    if (preloaded === null) return;
    const other = elements[1 - activeIdx];
    other?.removeAttribute("src");
    other?.load();
    preloaded = null;
  }

  function preloadNext() {
    if (!elements[activeIdx]) return;
    const next = upcoming();
    if (!next || next.qid === current()?.qid) return clearPreload();
    if (preloaded === next.qid) return;
    const other = standby();
    other.src = streamUrl(next.track.id);
    other.preload = "auto";
    other.load();
    preloaded = next.qid;
  }

  /** Loads the current queue entry into the playing element (or swaps in the preloaded one) and plays it. */
  async function loadCurrent(startAt = 0, autoplay = true) {
    const item = current();
    if (!item) return;
    const ready = preloaded === item.qid && elements[1 - activeIdx] && !elements[1 - activeIdx].error;
    let a: AudioLike;
    if (ready) {
      const old = elements[activeIdx];
      activeIdx = 1 - activeIdx;
      a = elements[activeIdx];
      old.pause();
      preloaded = null;
    } else {
      a = audio();
      a.src = streamUrl(item.track.id);
      a.load();
    }
    if (startAt > 0 || ready) a.currentTime = startAt;
    loadedQid = item.qid;
    set({ status: autoplay ? "loading" : "paused", currentTime: startAt, duration: item.track.durationMs / 1000 });
    if (autoplay) await start(a);
  }

  /** Plays on from where the player was: loads first if this entry was only restored, not yet loaded. */
  async function resume() {
    const item = current();
    if (!item) return;
    if (loadedQid !== item.qid) return loadCurrent(state.currentTime, true);
    await start(audio());
  }

  /** Moves on to the next entry (or wraps, or stops at the end). `ended` and the next button both come here. */
  async function advance() {
    const next = nextIndex(state.queue.length, state.index, state.repeat);
    if (next === null) {
      // The end of the queue: stop, ready to play the last track again.
      const a = audio();
      a.pause();
      a.currentTime = 0;
      set({ status: "paused", currentTime: 0 });
      return;
    }
    if (next === 0) {
      // Wrapped round: a shuffled queue starts a fresh cycle, never opening with the track that just played.
      if (state.shuffle) set({ queue: reshuffled(state.queue, current()?.qid, random) });
      set({ index: 0 });
    } else {
      set({ index: next });
    }
    await loadCurrent(0, true);
  }

  async function ended(a: AudioLike) {
    if (state.repeat === "one") {
      a.currentTime = 0;
      set({ currentTime: 0 });
      await start(a);
      return;
    }
    await advance();
  }

  function stop() {
    elements.forEach((a) => {
      a.pause();
      a.removeAttribute("src");
      a.load();
    });
    original = null;
    loadedQid = null;
    preloaded = null;
    set({ queue: [], index: -1, status: "idle", currentTime: 0, duration: 0 });
  }

  async function playList(tracks: PlayerTrack[], start = 0, opts: { shuffle?: boolean; randomStart?: boolean } = {}) {
    if (tracks.length === 0) return;
    const items = tracks.map(newItem);
    const shuffle = opts.shuffle ?? state.shuffle;
    let queue = items;
    let index = clamp(start, 0, items.length - 1);
    if (shuffle) {
      original = items.map((i) => i.qid);
      const first = opts.randomStart ? items[Math.floor(random() * items.length)] : items[index];
      queue = [first, ...shuffled(items.filter((i) => i !== first), random)];
      index = 0;
    } else {
      original = null;
    }
    set({ queue, index, shuffle });
    await loadCurrent(0, true);
  }

  const api = {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    /** Plays this one track; if it is already the current one, carries on from where it was. */
    async play(track: PlayerTrack) {
      if (state.track?.id === track.id && state.status !== "error") {
        if (state.status === "paused") await resume();
        return;
      }
      await playList([track], 0);
    },

    /** Replaces the queue with `tracks` and plays from `start`. With shuffle on, `start` still plays first. */
    playList,

    resume,

    pause() {
      elements[activeIdx]?.pause();
    },

    /** Play/pause for the player bar. After a failure it reloads the track, so nothing stays stuck. */
    async toggle() {
      if (!state.track) return;
      if (state.status === "playing" || state.status === "loading") {
        elements[activeIdx]?.pause();
        set({ status: "paused" });
      } else if (state.status === "error") {
        await loadCurrent(state.currentTime, true);
      } else {
        await resume();
      }
    },

    async next() {
      if (state.track) await advance();
    },

    /** Restarts the track if it is well underway, otherwise goes back one. */
    async previous() {
      if (!state.track) return;
      if (state.currentTime > RESTART_AFTER_SECONDS || (state.index === 0 && state.repeat !== "all")) {
        api.seek(0);
        return;
      }
      set({ index: state.index === 0 ? state.queue.length - 1 : state.index - 1 });
      await loadCurrent(0, true);
    },

    /** Plays this entry of the queue. */
    async jump(qid: string) {
      const i = state.queue.findIndex((item) => item.qid === qid);
      if (i < 0) return;
      if (i === state.index) return resume();
      set({ index: i });
      await loadCurrent(0, true);
    },

    async enqueue(track: PlayerTrack) {
      if (state.queue.length === 0) return playList([track], 0);
      const item = newItem(track);
      original?.push(item.qid);
      set({ queue: [...state.queue, item] });
      preloadNext();
    },

    /** Inserts right after the current track. */
    async playNext(track: PlayerTrack) {
      if (state.queue.length === 0) return playList([track], 0);
      const item = newItem(track);
      const queue = [...state.queue];
      queue.splice(state.index + 1, 0, item);
      if (original) {
        const at = original.indexOf(current()?.qid ?? "");
        original.splice(at < 0 ? original.length : at + 1, 0, item.qid);
      }
      set({ queue });
      preloadNext();
    },

    async removeAt(qid: string) {
      const i = state.queue.findIndex((item) => item.qid === qid);
      if (i < 0) return;
      const queue = state.queue.filter((item) => item.qid !== qid);
      if (original) original = original.filter((q) => q !== qid);
      if (i !== state.index) {
        set({ queue, index: i < state.index ? state.index - 1 : state.index });
        preloadNext();
        return;
      }
      // Removing what is playing: carry on with whatever follows it.
      const wasPlaying = state.status === "playing" || state.status === "loading";
      if (queue.length === 0) return stop();
      const wrapped = i >= queue.length;
      if (wrapped && state.repeat !== "all") {
        elements[activeIdx]?.pause();
        loadedQid = null;
        set({ queue, index: queue.length - 1, status: "paused", currentTime: 0, duration: queue[queue.length - 1].track.durationMs / 1000 });
        return;
      }
      set({ queue, index: wrapped ? 0 : i });
      if (wasPlaying) await loadCurrent(0, true);
      else {
        elements[activeIdx]?.pause();
        loadedQid = null;
        set({ status: "paused", currentTime: 0, duration: current()!.track.durationMs / 1000 });
      }
    },

    /** Reorders the queue, keeping the current track current. */
    move(from: number, to: number) {
      const qid = current()?.qid;
      const queue = moved(state.queue, from, to);
      set({ queue, index: queue.findIndex((item) => item.qid === qid) });
      preloadNext();
    },

    setShuffle(on: boolean) {
      if (on === state.shuffle) return;
      const now = current();
      if (on) {
        original = state.queue.map((item) => item.qid);
        const rest = shuffled(state.queue.filter((item) => item !== now), random);
        set({ queue: now ? [now, ...rest] : rest, index: now ? 0 : -1, shuffle: true });
      } else {
        const order = new Map((original ?? []).map((qid, i) => [qid, i]));
        const queue = [...state.queue].sort((a, b) => (order.get(a.qid) ?? Infinity) - (order.get(b.qid) ?? Infinity) || 0);
        original = null;
        set({ queue, index: queue.findIndex((item) => item.qid === now?.qid), shuffle: false });
      }
      preloadNext();
    },

    setRepeat(repeat: Repeat) {
      set({ repeat });
      preloadNext();
    },

    seek(seconds: number) {
      if (!state.track) return;
      const target = clamp(seconds, 0, state.duration);
      audio().currentTime = target;
      set({ currentTime: target });
    },

    setVolume(volume: number) {
      const level = clamp(volume, 0, 1);
      audio();
      elements.forEach((a) => {
        a.volume = level;
        a.muted = false;
      });
      set({ volume: level, muted: false });
      try {
        storage?.setItem(VOLUME_KEY, String(level));
      } catch {
        // Remembering the level is a convenience, not a requirement.
      }
    },

    setMuted(muted: boolean) {
      audio();
      elements.forEach((a) => (a.muted = muted));
      set({ muted });
    },

    /** Empties the player and its queue, for example on logout. */
    stop,
  };
  return api;
}

export type Player = ReturnType<typeof createPlayer>;

export const player = createPlayer();

// The server (and the hydration pass) always sees an idle player; a restored queue appears right after.
const IDLE: PlayerState = { track: null, queue: [], index: -1, shuffle: false, repeat: "off", status: "idle", currentTime: 0, duration: 0, volume: 1, muted: false };

export function usePlayer(): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getState, () => IDLE);
}
