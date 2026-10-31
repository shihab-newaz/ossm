/** Watched at 90%, or with fewer than 2 minutes left once at least half is behind you. */
export const WATCHED_FRACTION = 0.9;
export const WATCHED_REMAINING_MS = 120_000;

/**
 * Whether a position counts as having watched the video. The "2 minutes left" rule needs half the
 * video behind it, or a 3-minute clip would count as watched before it starts.
 */
export function isWatched(positionMs: number, durationMs: number): boolean {
  if (!(durationMs > 0) || !(positionMs >= 0)) return false;
  if (positionMs >= durationMs * WATCHED_FRACTION) return true;
  return durationMs - positionMs <= WATCHED_REMAINING_MS && positionMs >= durationMs / 2;
}

/** Where to start a video: the saved position, unless it is watched or barely started. */
export function resumePosition(progress: { positionMs: number; durationMs: number; watched: boolean } | undefined): number {
  if (!progress || progress.watched) return 0;
  if (progress.positionMs < 5_000 || isWatched(progress.positionMs, progress.durationMs)) return 0;
  return progress.positionMs;
}

export const REPORT_EVERY_MS = 15_000;

type Save = (positionMs: number, durationMs: number, opts: { keepalive: boolean }) => Promise<unknown> | void;

/**
 * Sends the position at most every 15 seconds while playing, and straight away on pause, after a
 * seek and when the page is hidden. Nothing is sent twice for the same position.
 */
export function createProgressReporter(save: Save, now: () => number = () => Date.now()) {
  let lastSentAt = -Infinity;
  let lastSent: number | null = null;

  function send(positionMs: number, durationMs: number, keepalive: boolean) {
    const pos = Math.max(0, Math.round(positionMs));
    if (pos === lastSent || !(durationMs > 0)) return;
    lastSent = pos;
    lastSentAt = now();
    try {
      void Promise.resolve(save(pos, Math.round(durationMs), { keepalive })).catch(() => {});
    } catch {
      // Progress is a convenience: a failed save must never interrupt playback.
    }
  }

  return {
    /** While playing: sends only if 15 seconds have passed since the last report. */
    tick(positionMs: number, durationMs: number) {
      if (now() - lastSentAt >= REPORT_EVERY_MS) send(positionMs, durationMs, false);
    },
    /** On pause or a finished seek. */
    flush(positionMs: number, durationMs: number) {
      send(positionMs, durationMs, false);
    },
    /** When the page goes away: the request must outlive it. */
    leave(positionMs: number, durationMs: number) {
      send(positionMs, durationMs, true);
    },
  };
}

export type ProgressReporter = ReturnType<typeof createProgressReporter>;
