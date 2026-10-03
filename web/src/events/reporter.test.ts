import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { createPlayer } from "@/player/player";
import { FakeAudio } from "@/test/fakeAudio";
import { server } from "@/test/server";
import { createListenTracker } from "./listens";
import { createReporter, type PlaybackEvent } from "./reporter";

const song = { id: "6b2f3c9e-0000-4000-8000-000000000001", title: "Midnight City", artist: "M83", album: "Hurry Up", durationMs: 243_000 };

let received: PlaybackEvent[];
let status: number;

const memory = () => {
  const store = new Map<string, string>();
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
};

beforeEach(() => {
  received = [];
  status = 202;
  server.use(
    http.post("*/api/v1/events/playback", async ({ request }) => {
      received.push((await request.json()) as PlaybackEvent);
      return new HttpResponse(null, { status });
    }),
  );
});

const listened = { type: "play_completed", trackId: song.id, positionMs: 30_000 } as const;

describe("sending events", () => {
  it("wraps a listen in the full envelope", async () => {
    const reporter = createReporter({ storage: memory(), now: () => Date.parse("2026-03-04T05:06:07.000Z"), id: () => "11111111-1111-4111-8111-111111111111" });

    await reporter.record(listened);

    expect(received).toEqual([
      {
        eventId: "11111111-1111-4111-8111-111111111111",
        schemaVersion: 1,
        trackId: song.id,
        type: "play_completed",
        occurredAt: "2026-03-04T05:06:07.000Z",
        positionMs: 30_000,
        clientId: "11111111-1111-4111-8111-111111111111",
      },
    ]);
    expect(reporter.pending).toBe(0);
  });

  it("gives every event its own id and keeps one client id", async () => {
    const storage = memory();
    const reporter = createReporter({ storage });

    await reporter.record(listened);
    await reporter.record({ ...listened, type: "skipped" });
    await createReporter({ storage }).record(listened);

    expect(new Set(received.map((e) => e.eventId)).size).toBe(3);
    expect(new Set(received.map((e) => e.clientId)).size).toBe(1);
  });

  it("keeps an event the server could not take and sends the very same event again", async () => {
    status = 503;
    const reporter = createReporter({ storage: memory(), retryMs: 5 });

    await reporter.record(listened);
    expect(reporter.pending).toBe(1);

    status = 202;
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(received.length).toBeGreaterThanOrEqual(2);
    expect(new Set(received.map((e) => e.eventId)).size).toBe(1);
    expect(reporter.pending).toBe(0);
  });

  it("gives up on an event the server rejects", async () => {
    status = 400;
    const reporter = createReporter({ storage: memory(), retryMs: 5 });

    await reporter.record(listened);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received).toHaveLength(1);
    expect(reporter.pending).toBe(0);
  });

  it("keeps events across a reload and sends them in order", async () => {
    const storage = memory();
    status = 503;
    const before = createReporter({ storage, retryMs: 60_000 });
    await before.record({ ...listened, type: "play_started", positionMs: 0 });
    await before.record(listened);
    received = [];

    status = 202;
    const after = createReporter({ storage });
    expect(after.pending).toBe(2);
    await after.flush();

    expect(received.map((e) => e.type)).toEqual(["play_started", "play_completed"]);
    expect(after.pending).toBe(0);
  });

  it("forgets unsent events on sign-out, so the next person is not credited with them", async () => {
    const storage = memory();
    status = 503;
    const reporter = createReporter({ storage, retryMs: 60_000 });
    await reporter.record(listened);
    received = [];

    reporter.clear();
    status = 202;
    await createReporter({ storage }).flush();

    expect(reporter.pending).toBe(0);
    expect(received).toEqual([]);
  });

  it("ignores a damaged outbox", () => {
    const storage = memory();
    storage.setItem("ossm.events", "{not json");

    expect(createReporter({ storage }).pending).toBe(0);
  });
});

describe("playing a track end to end", () => {
  it("sends one start and one qualifying play, with every envelope field", async () => {
    const audio = new FakeAudio();
    const player = createPlayer({ audio: () => audio, notify: () => {}, storage: null });
    const reporter = createReporter({ storage: memory() });
    const tracker = createListenTracker((event) => void reporter.record(event));
    player.subscribe(() => tracker.update(player.getState()));

    await player.play(song);
    for (let t = 0.25; t <= 61; t += 0.25) {
      audio.currentTime = t;
      audio.fire("timeupdate");
    }
    await reporter.flush();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received.map((e) => e.type)).toEqual(["play_started", "play_completed"]);
    for (const event of received) {
      expect(event).toMatchObject({ schemaVersion: 1, trackId: song.id });
      expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/);
      expect(event.clientId).toBeTruthy();
      expect(Number.isNaN(Date.parse(event.occurredAt))).toBe(false);
    }
    expect(received[1].positionMs).toBe(30_000);
  });

  it("sends a skip, and no qualifying play, when the track is left early", async () => {
    const audio = new FakeAudio();
    const player = createPlayer({ audio: () => audio, notify: () => {}, storage: null });
    const reporter = createReporter({ storage: memory() });
    const tracker = createListenTracker((event) => void reporter.record(event));
    player.subscribe(() => tracker.update(player.getState()));

    await player.playList([song, { ...song, id: "6b2f3c9e-0000-4000-8000-000000000002" }], 0);
    for (let t = 0.25; t <= 8; t += 0.25) {
      audio.currentTime = t;
      audio.fire("timeupdate");
    }
    await player.next();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received.map((e) => e.type)).toEqual(["play_started", "skipped", "play_started"]);
    expect(received[1].positionMs).toBe(8_000);
  });
});
