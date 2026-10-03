import { api } from "@/api/client";
import type { components } from "@/api/schema";
import type { ListenEvent } from "./listens";

export type PlaybackEvent = components["schemas"]["PlaybackEventRequest"];

/** The envelope version this client writes. The server rejects versions it does not know. */
export const SCHEMA_VERSION = 1;

type SendResult = "sent" | "drop" | "retry";
type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

type Options = {
  send?: (event: PlaybackEvent) => Promise<SendResult>;
  storage?: KeyValueStore | null;
  now?: () => number;
  id?: () => string;
  /** How long to wait before trying unsent events again. */
  retryMs?: number;
};

const PENDING_KEY = "ossm.events";
const CLIENT_KEY = "ossm.client";
/** More than this many unsent events and the oldest are dropped, so a long outage cannot fill the disk. */
const MAX_PENDING = 500;

/** A v4 UUID. crypto.randomUUID needs a secure context, and a self-hosted instance may be served over plain http. */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function defaultStorage(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

async function sendToApi(event: PlaybackEvent): Promise<SendResult> {
  try {
    const { response } = await api.POST("/api/v1/events/playback", { body: event });
    if (response.ok) return "sent";
    // The server is struggling: keep the event. Anything else is a verdict on the event itself
    // (or an ended session), and sending it again would not change that.
    return response.status >= 500 || response.status === 408 || response.status === 429 ? "retry" : "drop";
  } catch {
    return "retry";
  }
}

function isEvent(value: unknown): value is PlaybackEvent {
  const e = value as Partial<PlaybackEvent> | null;
  return !!e && typeof e.eventId === "string" && typeof e.trackId === "string" && typeof e.type === "string" && typeof e.positionMs === "number";
}

/**
 * Sends playback events to the API without ever blocking playback. Events wait in a small outbox
 * (kept in localStorage) until the server has taken them, so a dropped connection or a reload does
 * not lose a play. The server is idempotent by event id, so sending again is always safe.
 */
export function createReporter(options: Options = {}) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const send = options.send ?? sendToApi;
  const now = options.now ?? Date.now;
  const id = options.id ?? uuid;
  const retryMs = options.retryMs ?? 15_000;

  let pending: PlaybackEvent[] = load();
  let flushing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  function load(): PlaybackEvent[] {
    try {
      const parsed: unknown = JSON.parse(storage?.getItem(PENDING_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter(isEvent) : [];
    } catch {
      return [];
    }
  }

  function save() {
    try {
      storage?.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch {
      // The outbox is best effort; an event that cannot be remembered is still sent now.
    }
  }

  function clientId(): string {
    try {
      const known = storage?.getItem(CLIENT_KEY);
      if (known) return known;
      const fresh = id();
      storage?.setItem(CLIENT_KEY, fresh);
      return fresh;
    } catch {
      return id();
    }
  }
  const client = clientId();

  async function flush(): Promise<void> {
    if (flushing) return;
    flushing = true;
    const mine = generation;
    clearTimeout(timer);
    try {
      while (pending.length > 0 && mine === generation) {
        const result = await send(pending[0]);
        if (mine !== generation) return;
        if (result === "retry") {
          timer = setTimeout(() => void flush(), retryMs);
          return;
        }
        pending.shift();
        save();
      }
    } finally {
      // After clear() a newer flush may already be running; it owns the flag.
      if (mine === generation) flushing = false;
    }
  }

  return {
    /** Wraps what the listen tracker saw in the envelope and sends it. */
    record(event: ListenEvent) {
      pending.push({
        eventId: id(),
        schemaVersion: SCHEMA_VERSION,
        trackId: event.trackId,
        type: event.type,
        occurredAt: new Date(now()).toISOString(),
        positionMs: Math.max(0, event.positionMs),
        clientId: client,
      });
      if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING);
      save();
      return flush();
    },

    /** Tries the unsent events again (for example after a reload). */
    flush,

    /** Forgets unsent events, for when the person signs out: they must not be reported as the next person. */
    clear() {
      generation++;
      clearTimeout(timer);
      pending = [];
      flushing = false;
      save();
    },

    get pending() {
      return pending.length;
    },
  };
}

export type Reporter = ReturnType<typeof createReporter>;

export const reporter = createReporter();
