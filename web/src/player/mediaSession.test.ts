import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAudio } from "@/test/fakeAudio";
import { attachMediaSession, type SessionLike } from "./mediaSession";
import { createPlayer } from "./player";

const T = (n: number) => ({ id: `t${n}`, title: `Song ${n}`, artist: "Artist", album: "Album", coverUrl: "/api/v1/albums/a1/cover", durationMs: 200_000 });

type FakeSession = SessionLike & { handlers: Record<string, ((d: object) => void) | null> };
let session: FakeSession;

beforeEach(() => {
  const handlers: Record<string, ((d: object) => void) | null> = {};
  session = {
    metadata: null,
    playbackState: "none",
    handlers,
    setActionHandler: (action, handler) => void (handlers[action] = handler as ((d: object) => void) | null),
    setPositionState: vi.fn(),
  };
});

const setup = () => {
  const player = createPlayer({ audio: () => new FakeAudio(), notify: () => {}, storage: null });
  const detach = attachMediaSession(player, session, (init) => ({ ...init }), "http://localhost:8080/library");
  return { player, detach };
};

describe("media session", () => {
  it("shows title, artist, album and artwork for what is playing", async () => {
    const { player } = setup();

    await player.playList([T(1), T(2)], 0);

    expect(session.metadata).toEqual({
      title: "Song 1",
      artist: "Artist",
      album: "Album",
      artwork: [{ src: "http://localhost:8080/api/v1/albums/a1/cover", sizes: "512x512" }],
    });
    expect(session.playbackState).toBe("playing");
  });

  it("follows pause, resume and the next track", async () => {
    const { player } = setup();
    await player.playList([T(1), T(2)], 0);

    player.pause();
    expect(session.playbackState).toBe("paused");
    await player.next();
    expect((session.metadata as { title: string }).title).toBe("Song 2");
    expect(session.playbackState).toBe("playing");
  });

  it("works for a track with no cover or album", async () => {
    const { player } = setup();

    await player.playList([{ id: "x", title: "Bare", artist: "Nobody", durationMs: 1000 }], 0);

    expect(session.metadata).toEqual({ title: "Bare", artist: "Nobody", album: "", artwork: [] });
  });

  it("reports the position to the lock screen", async () => {
    const { player } = setup();
    await player.playList([T(1)], 0);

    player.seek(90);

    expect(session.setPositionState).toHaveBeenLastCalledWith({ duration: 200, position: 90, playbackRate: 1 });
  });

  it("media keys drive the player", async () => {
    const { player } = setup();
    await player.playList([T(1), T(2), T(3)], 1);

    session.handlers.pause!({});
    expect(player.getState().status).toBe("paused");
    session.handlers.play!({});
    await vi.waitFor(() => expect(player.getState().status).toBe("playing"));

    session.handlers.nexttrack!({});
    await vi.waitFor(() => expect(player.getState().track?.id).toBe("t3"));
    session.handlers.previoustrack!({});
    await vi.waitFor(() => expect(player.getState().track?.id).toBe("t2"));

    session.handlers.seekto!({ seekTime: 60 });
    expect(player.getState().currentTime).toBe(60);
    session.handlers.seekforward!({});
    expect(player.getState().currentTime).toBe(70);
    session.handlers.seekbackward!({ seekOffset: 30 });
    expect(player.getState().currentTime).toBe(40);
  });

  it("clears itself when the player is emptied, and lets go of the media keys when detached", async () => {
    const { player, detach } = setup();
    await player.playList([T(1)], 0);

    player.stop();
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe("none");

    await player.playList([T(1)], 0);
    detach();
    expect(Object.values(session.handlers).every((h) => h === null)).toBe(true);
    expect(session.metadata).toBeNull();
  });

  it("does nothing, and does not crash, in a browser without the API", () => {
    const player = createPlayer({ audio: () => new FakeAudio(), notify: () => {}, storage: null });
    expect(() => attachMediaSession(player, undefined)()).not.toThrow();
  });

  it("survives a browser that rejects some actions", () => {
    session.setActionHandler = () => {
      throw new TypeError("unsupported action");
    };
    expect(() => setup()).not.toThrow();
  });
});
