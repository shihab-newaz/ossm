import { describe, expect, it } from "vitest";
import type { Video } from "./data";
import { cardSubtitle, cardTitle, codecLabel, episodeRowTitle, longDuration, progressPercent, resolutionLabel, shortDuration, showCounts, videoQuality } from "./format";

const movie = (extra: Partial<Video> = {}): Video => ({
  id: "v1",
  kind: "MOVIE",
  title: "Sintel",
  year: 2010,
  durationMs: 888_000,
  playable: true,
  license: "CC BY",
  uploadedBy: "maya",
  createdAt: "2026-10-12T10:00:00Z",
  ...extra,
});

describe("video labels", () => {
  it("names resolutions the way people say them", () => {
    expect(resolutionLabel(2160)).toBe("4K");
    expect(resolutionLabel(1080)).toBe("1080P");
    expect(resolutionLabel(1038)).toBe("1080P"); // cropped widescreen
    expect(resolutionLabel(720)).toBe("720P");
    expect(resolutionLabel(480)).toBe("480P");
    expect(resolutionLabel(undefined)).toBeNull();
  });

  it("names codecs the way people know them", () => {
    expect(codecLabel("h264")).toBe("H.264");
    expect(codecLabel("hevc")).toBe("HEVC");
    expect(codecLabel("vp9")).toBe("VP9");
    expect(codecLabel("prores")).toBe("PRORES");
    expect(codecLabel(undefined)).toBeNull();
  });

  it("builds the quality badge from whatever is known", () => {
    expect(videoQuality({ height: 2160, videoCodec: "hevc" })).toBe("4K · HEVC");
    expect(videoQuality({ height: 720 })).toBe("720P");
    expect(videoQuality({})).toBeNull();
  });

  it("rounds card durations to the minute and pads hours", () => {
    expect(shortDuration(596_000)).toBe("10m");
    expect(shortDuration(3_852_000)).toBe("1h 04m");
    expect(shortDuration(20_000)).toBe("1m");
  });

  it("gives the watch page minutes and seconds under an hour", () => {
    expect(longDuration(888_000)).toBe("14m 48s");
    expect(longDuration(2_520_000)).toBe("42m");
    expect(longDuration(3_852_000)).toBe("1h 04m");
    expect(longDuration(45_000)).toBe("45s");
  });

  it("describes a movie by year and length, an episode by where it sits", () => {
    expect(cardTitle(movie())).toBe("Sintel");
    expect(cardSubtitle(movie())).toBe("2010 · 15m");
    const episode = movie({ kind: "EPISODE", title: "The Long Way Home", showName: "Night Kitchen", season: 2, episode: 5 });
    expect(cardTitle(episode)).toBe("Night Kitchen");
    expect(cardSubtitle(episode)).toBe("S2 · E5 · The Long Way Home");
    expect(episodeRowTitle(episode)).toBe("E5 · The Long Way Home");
  });

  it("shows progress only for videos in progress", () => {
    const progress = { positionMs: 444_000, durationMs: 888_000, watched: false, updatedAt: "2026-10-20T10:00:00Z" };
    expect(progressPercent(movie({ progress }))).toBe(50);
    expect(progressPercent(movie({ progress: { ...progress, watched: true } }))).toBe(0);
    expect(progressPercent(movie())).toBe(0);
    // A few seconds in still shows a sliver, so it reads as started.
    expect(progressPercent(movie({ progress: { ...progress, positionMs: 1000 } }))).toBe(1);
  });

  it("counts seasons and episodes in words", () => {
    expect(showCounts(3, 24)).toBe("3 seasons · 24 episodes");
    expect(showCounts(1, 1)).toBe("1 season · 1 episode");
  });
});
