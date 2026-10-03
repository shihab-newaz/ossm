import { describe, expect, it } from "vitest";
import { moved, nextIndex, reshuffled, shuffled, type QueueItem } from "./queue";

const items = (n: number): QueueItem[] =>
  Array.from({ length: n }, (_, i) => ({ qid: `q${i}`, track: { id: `t${i}`, title: `Song ${i}`, artist: "A", durationMs: 1000 } }));

/** A repeatable pseudo-random source, so shuffles can be checked across many seeds. */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe("shuffled", () => {
  it("keeps every entry exactly once, and does not touch the input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    for (let seed = 1; seed <= 100; seed++) {
      const out = shuffled(input, seeded(seed));
      expect([...out].sort()).toEqual(input);
    }
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("actually reorders (not the identity for most seeds)", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const changed = Array.from({ length: 50 }, (_, s) => shuffled(input, seeded(s + 1)).join() !== input.join()).filter(Boolean).length;
    expect(changed).toBeGreaterThan(45);
  });
});

describe("reshuffled", () => {
  it("never opens the new cycle with the track that closed the last one", () => {
    const list = items(5);
    for (let seed = 1; seed <= 200; seed++) {
      expect(reshuffled(list, "q3", seeded(seed))[0].qid).not.toBe("q3");
    }
  });

  it("copes with a single track", () => {
    expect(reshuffled(items(1), "q0", () => 0).map((i) => i.qid)).toEqual(["q0"]);
  });
});

describe("nextIndex", () => {
  it("goes forward, wraps only for repeat all, and ends otherwise", () => {
    expect(nextIndex(3, 0, "off")).toBe(1);
    expect(nextIndex(3, 2, "off")).toBeNull();
    expect(nextIndex(3, 2, "all")).toBe(0);
    expect(nextIndex(3, 2, "one")).toBeNull();
    expect(nextIndex(0, -1, "all")).toBeNull();
  });
});

describe("moved", () => {
  it("moves one entry and clamps the target", () => {
    expect(moved([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moved([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
    expect(moved([1, 2, 3], 0, 99)).toEqual([2, 3, 1]);
    expect(moved([1, 2, 3], 1, -4)).toEqual([2, 1, 3]);
    expect(moved([1, 2, 3], 7, 0)).toEqual([1, 2, 3]);
  });
});
