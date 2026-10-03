import { beforeEach, describe, expect, it } from "vitest";
import { FakeAudio } from "@/test/fakeAudio";
import { createPlayer } from "@/player/player";
import { createListenTracker, qualifyingSeconds, type ListenEvent } from "./listens";

const song = { id: "t1", title: "Midnight City", artist: "M83", album: "Hurry Up", durationMs: 243_000 };
const next = { ...song, id: "t2", title: "Wait" };
const short = { ...song, id: "t3", title: "Interlude", durationMs: 40_000 };

describe("the 30 seconds or 50% rule", () => {
  it("is 30 seconds for an ordinary track", () => {
    expect(qualifyingSeconds(243)).toBe(30);
    expect(qualifyingSeconds(60)).toBe(30);
  });

  it("is half the track when that comes first", () => {
    expect(qualifyingSeconds(40)).toBe(20);
    expect(qualifyingSeconds(10)).toBe(5);
  });

  it("falls back to 30 seconds while the length is unknown", () => {
    expect(qualifyingSeconds(0)).toBe(30);
    expect(qualifyingSeconds(NaN)).toBe(30);
  });
});

let audio: FakeAudio;
let events: ListenEvent[];

function setup() {
  const player = createPlayer({ audio: () => audio, notify: () => {}, storage: null });
  const tracker = createListenTracker((event) => events.push(event));
  tracker.update(player.getState());
  player.subscribe(() => tracker.update(player.getState()));
  return player;
}

/** Listens for this many seconds, with a timeupdate every quarter second like a browser. */
function listen(seconds: number) {
  const end = audio.currentTime + seconds;
  while (audio.currentTime < end - 1e-9) {
    audio.currentTime = Math.round((audio.currentTime + 0.25) * 100) / 100;
    audio.fire("timeupdate");
  }
}

const types = () => events.map((e) => e.type);

beforeEach(() => {
  audio = new FakeAudio();
  events = [];
});

describe("what listening produces", () => {
  it("reports a start, then exactly one qualifying play at 30 seconds", async () => {
    const player = setup();
    await player.play(song);

    listen(29.5);
    expect(types()).toEqual(["play_started"]);

    listen(0.5);
    expect(events).toEqual([
      { type: "play_started", trackId: "t1", positionMs: 0 },
      { type: "play_completed", trackId: "t1", positionMs: 30_000 },
    ]);

    listen(60);
    expect(types()).toEqual(["play_started", "play_completed"]);
  });

  it("counts a short track at half its length", async () => {
    const player = setup();
    await player.play(short);

    listen(19.75);
    expect(types()).toEqual(["play_started"]);
    listen(0.25);

    expect(events.at(-1)).toEqual({ type: "play_completed", trackId: "t3", positionMs: 20_000 });
  });

  it("calls leaving a track before the threshold a skip, not a play", async () => {
    const player = setup();
    await player.playList([song, next], 0);
    listen(10);

    await player.next();

    expect(events).toEqual([
      { type: "play_started", trackId: "t1", positionMs: 0 },
      { type: "skipped", trackId: "t1", positionMs: 10_000 },
      { type: "play_started", trackId: "t2", positionMs: 0 },
    ]);
  });

  it("does not call it a skip to move on after the play already counted", async () => {
    const player = setup();
    await player.playList([song, next], 0);
    listen(31);

    await player.next();

    expect(types()).toEqual(["play_started", "play_completed", "play_started"]);
  });

  it("treats jumping to another queue entry the same way", async () => {
    const player = setup();
    await player.playList([song, next], 0);
    listen(5);

    await player.jump(player.getState().queue[1].qid);

    expect(types()).toEqual(["play_started", "skipped", "play_started"]);
  });

  it("does not let seeking ahead count as listening", async () => {
    const player = setup();
    await player.play(song);
    listen(5);

    player.seek(150);
    listen(5);

    expect(types()).toEqual(["play_started"]);
  });

  it("counts only time spent listening across a pause", async () => {
    const player = setup();
    await player.play(song);
    listen(20);

    player.pause();
    audio.currentTime += 600;
    audio.fire("timeupdate");
    await player.resume();
    listen(9.75);

    expect(types()).toEqual(["play_started"]);
    listen(0.25);
    expect(types()).toEqual(["play_started", "play_completed"]);
  });

  it("does not start a second play when a track is paused and resumed", async () => {
    const player = setup();
    await player.play(song);
    listen(3);
    player.pause();
    await player.resume();
    listen(3);

    expect(types()).toEqual(["play_started"]);
  });

  it("starts a new play each time repeat one loops the track", async () => {
    const player = setup();
    player.setRepeat("one");
    await player.play(song);
    listen(31);

    audio.currentTime = 243;
    audio.fire("ended");
    await Promise.resolve();
    audio.currentTime = 0;
    audio.fire("timeupdate");
    listen(31);

    expect(types()).toEqual(["play_started", "play_completed", "play_started", "play_completed"]);
  });

  it("reports a skip when a track ends having been mostly jumped over", async () => {
    const player = setup();
    await player.playList([song, next], 0);
    listen(2);

    player.seek(242);
    audio.currentTime = 243;
    audio.fire("ended");
    await Promise.resolve();

    expect(types().slice(0, 3)).toEqual(["play_started", "skipped", "play_started"]);
  });

  it("says nothing about a queue that was only restored, until it plays", async () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const first = createPlayer({ audio: () => audio, notify: () => {}, storage });
    await first.playList([song], 0);
    first.pause();

    const player = createPlayer({ audio: () => audio, notify: () => {}, storage });
    const tracker = createListenTracker((event) => events.push(event));
    tracker.update(player.getState());
    player.subscribe(() => tracker.update(player.getState()));
    expect(events).toEqual([]);

    await player.resume();
    expect(types()).toEqual(["play_started"]);
  });

  it("reports a skip when the player is emptied mid-track", async () => {
    const player = setup();
    await player.play(song);
    listen(4);

    player.stop();

    expect(events.at(-1)).toEqual({ type: "skipped", trackId: "t1", positionMs: 4_000 });
  });
});
