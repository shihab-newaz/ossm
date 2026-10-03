import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createPlayer, type AudioLike } from "./player";

const track = { id: "t1", title: "Midnight City", artist: "M83", album: "Hurry Up", coverUrl: "/api/v1/albums/a1/cover", durationMs: 243_000 };
const other = { ...track, id: "t2", title: "Wait" };

/** jsdom cannot play media, so this stands in for the element and lets a test fire the events a browser would. */
class FakeAudio extends EventTarget implements AudioLike {
  src = "";
  currentTime = 0;
  duration = NaN;
  volume = 1;
  muted = false;
  paused = true;
  error: { code: number } | null = null;
  playRejection: Error | null = null;

  play = vi.fn(async () => {
    if (this.playRejection) throw this.playRejection;
    this.paused = false;
    this.fire("playing");
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.fire("pause");
  });
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => {
    if (name === "src") this.src = "";
  });
  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }
}

let audio: FakeAudio;
let notify: Mock<(message: string) => void>;
const make = () => createPlayer({ audio: () => audio, notify, storage: null });

beforeEach(() => {
  audio = new FakeAudio();
  notify = vi.fn();
});

describe("play and pause", () => {
  it("starts a track from the stream endpoint and reports it playing", async () => {
    const player = make();

    await player.play(track);

    expect(audio.src).toBe("/api/v1/tracks/t1/stream");
    expect(player.getState()).toMatchObject({ track, status: "playing", currentTime: 0, duration: 243 });
  });

  it("is loading until the browser says audio is flowing", async () => {
    audio.play = vi.fn(() => new Promise<void>(() => {}));
    const player = make();

    void player.play(track);

    expect(player.getState().status).toBe("loading");
  });

  it("pauses and resumes the same track without reloading it", async () => {
    const player = make();
    await player.play(track);

    player.pause();
    expect(player.getState().status).toBe("paused");

    audio.load.mockClear();
    await player.play(track);
    expect(player.getState().status).toBe("playing");
    expect(audio.src).toBe("/api/v1/tracks/t1/stream");
    expect(audio.load).not.toHaveBeenCalled();
  });

  it("toggle flips between playing and paused, and does nothing with no track", async () => {
    const player = make();
    await player.toggle();
    expect(player.getState().status).toBe("idle");

    await player.play(track);
    await player.toggle();
    expect(player.getState().status).toBe("paused");
    await player.toggle();
    expect(player.getState().status).toBe("playing");
  });

  it("switching tracks replaces the source and starts from zero", async () => {
    const player = make();
    await player.play(track);
    audio.currentTime = 90;
    audio.fire("timeupdate");

    await player.play(other);

    expect(audio.src).toBe("/api/v1/tracks/t2/stream");
    expect(player.getState()).toMatchObject({ track: other, currentTime: 0, status: "playing" });
  });

  it("goes back to the start when a track ends, ready to play again", async () => {
    const player = make();
    await player.play(track);
    audio.currentTime = 243;

    audio.fire("ended");

    expect(player.getState()).toMatchObject({ status: "paused", currentTime: 0 });
    await player.toggle();
    expect(audio.currentTime).toBe(0);
    expect(player.getState().status).toBe("playing");
  });
});

describe("progress", () => {
  it("follows the element's clock and prefers its real duration once known", async () => {
    const player = make();
    await player.play(track);

    audio.currentTime = 61.5;
    audio.fire("timeupdate");
    expect(player.getState().currentTime).toBe(61.5);

    audio.duration = 240.2;
    audio.fire("durationchange");
    expect(player.getState().duration).toBe(240.2);
  });

  it("ignores a duration that is not a real number (streams report Infinity or NaN)", async () => {
    const player = make();
    await player.play(track);

    audio.duration = Infinity;
    audio.fire("durationchange");

    expect(player.getState().duration).toBe(243);
  });
});

describe("seek", () => {
  it("jumps to the requested second and updates the state at once", async () => {
    const player = make();
    await player.play(track);

    player.seek(120);

    expect(audio.currentTime).toBe(120);
    expect(player.getState().currentTime).toBe(120);
  });

  it("clamps to the start and the end", async () => {
    const player = make();
    await player.play(track);

    player.seek(-5);
    expect(audio.currentTime).toBe(0);
    player.seek(9999);
    expect(audio.currentTime).toBe(243);
  });

  it("does nothing with nothing loaded", () => {
    const player = make();
    player.seek(30);
    expect(audio.currentTime).toBe(0);
    expect(player.getState().currentTime).toBe(0);
  });
});

describe("volume", () => {
  it("sets the element volume, clamped to 0..1, and unmutes when raised", () => {
    const player = make();

    player.setVolume(0.4);
    expect(audio.volume).toBe(0.4);
    expect(player.getState().volume).toBe(0.4);

    player.setVolume(3);
    expect(audio.volume).toBe(1);
    player.setVolume(-1);
    expect(audio.volume).toBe(0);
  });

  it("mutes and unmutes without losing the level", () => {
    const player = make();
    player.setVolume(0.6);

    player.setMuted(true);
    expect(audio.muted).toBe(true);
    expect(player.getState()).toMatchObject({ muted: true, volume: 0.6 });

    player.setMuted(false);
    expect(audio.muted).toBe(false);

    player.setMuted(true);
    player.setVolume(0.7);
    expect(player.getState().muted).toBe(false);
  });

  it("remembers the level for next time, and survives storage being unavailable", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    createPlayer({ audio: () => audio, notify, storage }).setVolume(0.3);
    expect(store.get("ossm.volume")).toBe("0.3");

    expect(createPlayer({ audio: () => new FakeAudio(), notify, storage }).getState().volume).toBe(0.3);

    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const player = createPlayer({ audio: () => audio, notify, storage: broken });
    expect(() => player.setVolume(0.5)).not.toThrow();
    expect(player.getState().volume).toBe(0.5);
  });
});

describe("errors", () => {
  it("tells the user when the stream fails, and lets them try again", async () => {
    const player = make();
    await player.play(track);

    audio.error = { code: 4 };
    audio.fire("error");

    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Midnight City"));
    expect(player.getState()).toMatchObject({ status: "error", track });

    // Not stuck: the same button tries again and works once the cause is gone.
    audio.error = null;
    await player.toggle();
    expect(audio.load).toHaveBeenCalled();
    expect(player.getState().status).toBe("playing");
  });

  it("reports a play() that the server rejected, and recovers on the next track", async () => {
    audio.playRejection = Object.assign(new Error("no supported source"), { name: "NotSupportedError" });
    const player = make();

    await player.play(track);
    expect(player.getState().status).toBe("error");
    expect(notify).toHaveBeenCalledTimes(1);

    audio.playRejection = null;
    await player.play(other);
    expect(player.getState()).toMatchObject({ status: "playing", track: other });
  });

  it("treats a blocked autoplay as a pause, not an error", async () => {
    audio.playRejection = Object.assign(new Error("blocked"), { name: "NotAllowedError" });
    const player = make();

    await player.play(track);

    expect(player.getState().status).toBe("paused");
    expect(notify).not.toHaveBeenCalled();
  });

  it("ignores the abort caused by switching tracks quickly", async () => {
    audio.playRejection = Object.assign(new Error("interrupted by a new load"), { name: "AbortError" });
    const player = make();

    await player.play(track);

    expect(notify).not.toHaveBeenCalled();
    expect(player.getState().status).not.toBe("error");
  });
});

describe("stop and subscriptions", () => {
  it("stop empties the player and releases the source", async () => {
    const player = make();
    await player.play(track);

    player.stop();

    expect(player.getState()).toMatchObject({ track: null, status: "idle", currentTime: 0 });
    expect(audio.src).toBe("");
  });

  it("notifies subscribers of changes and stops once they unsubscribe", async () => {
    const player = make();
    const listener = vi.fn();
    const unsubscribe = player.subscribe(listener);

    await player.play(track);
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    unsubscribe();
    player.pause();
    expect(listener).not.toHaveBeenCalled();
  });
});
