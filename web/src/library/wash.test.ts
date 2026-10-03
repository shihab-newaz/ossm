import { describe, expect, it } from "vitest";
import { LICENSES, licenseInfo } from "./licenses";
import { quality } from "./quality";
import { MIN_CONTRAST, contrastRatio, washColor } from "./wash";

describe("the header wash", () => {
  it("keeps white text at 4.5:1 or better whatever the cover colour", () => {
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    const steps = [0, 51, 102, 153, 204, 255];
    let checked = 0;
    for (const r of steps)
      for (const g of steps)
        for (const b of steps) {
          const wash = washColor(`#${hex(r)}${hex(g)}${hex(b)}`)!;
          expect(contrastRatio("#ffffff", wash), `#${hex(r)}${hex(g)}${hex(b)} became ${wash}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
          checked++;
        }
    expect(checked).toBe(216);
  });

  it("darkens a light cover and keeps its hue", () => {
    const wash = washColor("#ffe066")!;
    expect(contrastRatio("#ffffff", "#ffe066")).toBeLessThan(MIN_CONTRAST);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(wash.slice(i, i + 2), 16));
    // Still a yellow: red and green well above blue.
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it("leaves a colour that already reads well alone", () => {
    expect(washColor("#336699")).toBe("#336699");
  });

  it("lifts a near-black cover so the header is not a hole", () => {
    expect(washColor("#000000")).not.toBe("#000000");
    expect(contrastRatio("#ffffff", washColor("#050505")!)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("has no wash without a usable colour", () => {
    expect(washColor(undefined)).toBeNull();
    expect(washColor("")).toBeNull();
    expect(washColor("blue")).toBeNull();
  });
});

describe("quality", () => {
  it("names lossy formats with their bitrate and lossless ones plainly", () => {
    expect(quality("mp3", 320)).toEqual({ label: "MP3 320", lossless: false });
    expect(quality("opus", 160)).toEqual({ label: "OPUS 160", lossless: false });
    expect(quality("flac", 900)).toEqual({ label: "FLAC", lossless: true });
    expect(quality("aac", undefined)).toEqual({ label: "AAC", lossless: false });
    expect(quality(undefined, 320)).toBeNull();
  });
});

describe("licenses", () => {
  it("explains every license a track can have", () => {
    for (const name of ["All rights reserved", "CC BY", "CC BY-SA", "CC BY-NC", "CC BY-ND", "CC BY-NC-SA", "CC BY-NC-ND", "CC0"]) {
      expect(LICENSES[name]?.summary.length, name).toBeGreaterThan(20);
    }
  });

  it("says plainly when it does not know one", () => {
    expect(licenseInfo("WTFPL").label).toBe("WTFPL");
    expect(licenseInfo("WTFPL").summary).toMatch(/not one OSSM knows/);
  });
});
