import { describe, expect, it, vi } from "vitest";
import { FakeAudio } from "@/test/fakeAudio";
import { createVideoEngine } from "./engine";

async function loaded(opts: { startAt?: number } = {}) {
  const onStart = vi.fn();
  const engine = createVideoEngine({ onStart });
  const media = new FakeAudio();
  engine.attach(media);
  await engine.load("/api/v1/videos/v1/stream", { startAt: opts.startAt, durationSeconds: 600 });
  return { engine, media, onStart };
}

describe("the video engine", () => {
  it("loads the file and plays it, telling the music to stop", async () => {
    const { engine, media, onStart } = await loaded();
    expect(media.src).toBe("/api/v1/videos/v1/stream");
    expect(media.load).toHaveBeenCalled();
    expect(media.play).toHaveBeenCalled();
    expect(onStart).toHaveBeenCalled();
    expect(engine.getState().status).toBe("playing");
  });

  it("starts at the saved position once the browser knows the file", async () => {
    const { engine, media } = await loaded({ startAt: 120 });
    expect(engine.getState().currentTime).toBe(120);
    Object.defineProperty(media, "duration", { value: 600, configurable: true });
    media.fire("loadedmetadata");
    expect(media.currentTime).toBe(120);
    expect(engine.getState().duration).toBe(600);
  });

  it("pauses, resumes and tells music to stop again on every start", async () => {
    const { engine, media, onStart } = await loaded();
    await engine.toggle();
    expect(media.pause).toHaveBeenCalled();
    expect(engine.getState().status).toBe("paused");
    await engine.toggle();
    expect(engine.getState().status).toBe("playing");
    expect(onStart).toHaveBeenCalledTimes(2);
  });

  it("keeps seeks inside the video", async () => {
    const { engine, media } = await loaded();
    engine.seek(-30);
    expect(media.currentTime).toBe(0);
    engine.seek(10_000);
    expect(media.currentTime).toBe(600);
    engine.seek(42);
    engine.skip(10);
    expect(engine.getState().currentTime).toBe(52);
  });

  it("plays again from the start after the end", async () => {
    const { engine, media } = await loaded();
    media.fire("ended");
    expect(engine.getState().status).toBe("ended");
    await engine.toggle();
    expect(media.currentTime).toBe(0);
    expect(engine.getState().status).toBe("playing");
  });

  it("reports a file that cannot play", async () => {
    const { engine, media } = await loaded();
    media.fire("error");
    expect(engine.getState().status).toBe("error");
  });

  it("waits for a press when the browser refuses to autoplay", async () => {
    const engine = createVideoEngine();
    const media = new FakeAudio();
    media.playRejection = Object.assign(new Error("no autoplay"), { name: "NotAllowedError" });
    engine.attach(media);
    await engine.load("/api/v1/videos/v1/stream");
    expect(engine.getState().status).toBe("paused");
  });

  it("sets volume and mute on the element", async () => {
    const { engine, media } = await loaded();
    engine.setVolume(0.4);
    expect(media.volume).toBe(0.4);
    engine.setMuted(true);
    expect(media.muted).toBe(true);
    expect(engine.getState().muted).toBe(true);
  });
});
