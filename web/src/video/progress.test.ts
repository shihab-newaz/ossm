import { describe, expect, it, vi } from "vitest";
import { createProgressReporter, isWatched, REPORT_EVERY_MS, resumePosition } from "./progress";

const MIN = 60_000;

describe("the watched threshold", () => {
  it("counts a video as watched at 90%", () => {
    expect(isWatched(89 * MIN, 100 * MIN)).toBe(false);
    expect(isWatched(90 * MIN, 100 * MIN)).toBe(true);
  });

  it("counts a video as watched with fewer than 2 minutes left, before 90% is reached", () => {
    // 15 min episode: 90% is 13.5 min, but the last 2 minutes start at 13.
    expect(isWatched(13 * MIN, 15 * MIN)).toBe(true);
    expect(isWatched(12.9 * MIN, 15 * MIN)).toBe(false);
  });

  it("does not count a short clip as watched before half of it has played", () => {
    expect(isWatched(0, 3 * MIN)).toBe(false);
    expect(isWatched(1 * MIN, 3 * MIN)).toBe(false);
    expect(isWatched(1.6 * MIN, 3 * MIN)).toBe(true);
  });

  it("is never watched without a duration", () => {
    expect(isWatched(10_000, 0)).toBe(false);
    expect(isWatched(10_000, Number.NaN)).toBe(false);
  });
});

describe("where a video starts", () => {
  const p = (positionMs: number, watched = false) => ({ positionMs, durationMs: 100 * MIN, watched });

  it("resumes at the saved position", () => {
    expect(resumePosition(p(21 * MIN))).toBe(21 * MIN);
  });

  it("starts over when watched, barely started, or never seen", () => {
    expect(resumePosition(p(95 * MIN, true))).toBe(0);
    expect(resumePosition(p(95 * MIN))).toBe(0);
    expect(resumePosition(p(3_000))).toBe(0);
    expect(resumePosition(undefined)).toBe(0);
  });
});

describe("progress reports", () => {
  function setup() {
    let clock = 0;
    const save = vi.fn();
    const reporter = createProgressReporter(save, () => clock);
    return { save, reporter, advance: (ms: number) => (clock += ms) };
  }

  it("sends at most one report every 15 seconds while playing", () => {
    const { save, reporter, advance } = setup();
    reporter.tick(1_000, 600_000);
    for (let s = 2; s <= 14; s++) {
      advance(1_000);
      reporter.tick(s * 1_000, 600_000);
    }
    expect(save).toHaveBeenCalledTimes(1);
    advance(REPORT_EVERY_MS);
    reporter.tick(30_000, 600_000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(30_000, 600_000, { keepalive: false });
  });

  it("sends straight away on pause, and asks the request to outlive the page when leaving", () => {
    const { save, reporter } = setup();
    reporter.tick(1_000, 600_000);
    reporter.flush(2_500, 600_000);
    reporter.leave(3_000, 600_000);
    expect(save.mock.calls).toEqual([
      [1_000, 600_000, { keepalive: false }],
      [2_500, 600_000, { keepalive: false }],
      [3_000, 600_000, { keepalive: true }],
    ]);
  });

  it("does not send the same position twice", () => {
    const { save, reporter } = setup();
    reporter.flush(2_500, 600_000);
    reporter.flush(2_500, 600_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("never lets a failed save escape", async () => {
    const reporter = createProgressReporter(() => Promise.reject(new Error("offline")));
    expect(() => reporter.flush(1_000, 600_000)).not.toThrow();
    await Promise.resolve();
  });
});
