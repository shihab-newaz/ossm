import type { components } from "@/api/schema";

type Track = components["schemas"]["Track"];
export type PlayerTrack = Pick<Track, "id" | "title" | "artist" | "durationMs"> & Partial<Pick<Track, "album" | "coverUrl">>;

/** A track in the queue. The same track can be queued twice, so each entry has its own id. */
export type QueueItem = { qid: string; track: PlayerTrack };

export type Repeat = "off" | "all" | "one";

/** Fisher-Yates. Pure given `random`, so tests can pin the order. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Shuffles a whole new cycle, making sure it does not open with the track that just played
 * (which would play it twice in a row across the cycle boundary).
 */
export function reshuffled(items: readonly QueueItem[], lastPlayed: string | undefined, random: () => number): QueueItem[] {
  const out = shuffled(items, random);
  if (out.length > 1 && out[0].qid === lastPlayed) [out[0], out[1]] = [out[1], out[0]];
  return out;
}

/** Where "next" goes from `index`, or null at the end of the queue with repeat off. */
export function nextIndex(length: number, index: number, repeat: Repeat): number | null {
  if (index + 1 < length) return index + 1;
  return repeat === "all" && length > 0 ? 0 : null;
}

/** Moves one entry, returning a new array. Out-of-range targets are clamped. */
export function moved<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return [...items];
  const out = [...items];
  const [item] = out.splice(from, 1);
  out.splice(Math.min(Math.max(to, 0), out.length), 0, item);
  return out;
}
