import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAudio } from "@/test/fakeAudio";
import { createPlayer, streamUrl } from "./player";

const T = (n: number) => ({ id: `t${n}`, title: `Song ${n}`, artist: "A", album: "Al", coverUrl: `/api/v1/albums/a/cover`, durationMs: 200_000 });
const tracks = (n: number) => Array.from({ length: n }, (_, i) => T(i + 1));

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

let els: FakeAudio[];
let notify: ReturnType<typeof vi.fn>;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

function harness(options: { storage?: ReturnType<typeof memoryStorage> | null; random?: () => number } = {}) {
  const player = createPlayer({
    audio: () => {
      const el = new FakeAudio();
      els.push(el);
      return el;
    },
    notify: notify as unknown as (m: string) => void,
    storage: options.storage === undefined ? null : options.storage,
    random: options.random,
  });
  /** The element that is playing right now. */
  const playing = () => els.find((e) => !e.paused)!;
  /** The current track finishes on its own. */
  const finish = async () => {
    playing().fire("ended");
    await flush();
  };
  const ids = () => player.getState().queue.map((i) => i.track.id);
  const current = () => player.getState().track?.id;
  return { player, playing, finish, ids, current };
}

beforeEach(() => {
  els = [];
  notify = vi.fn();
});

describe("playing a list", () => {
  it("queues the list and starts at the chosen track", async () => {
    const { player, ids, current } = harness();

    await player.playList(tracks(4), 2);

    expect(ids()).toEqual(["t1", "t2", "t3", "t4"]);
    expect(current()).toBe("t3");
    expect(els[0].src).toBe(streamUrl("t3"));
    expect(player.getState().status).toBe("playing");
  });

  it("an album plays track to track on its own", async () => {
    const { player, finish, current } = harness();
    await player.playList(tracks(3), 0);

    await finish();
    expect(current()).toBe("t2");
    await finish();
    expect(current()).toBe("t3");
    expect(player.getState().status).toBe("playing");
  });

  it("stops at the end of the queue with repeat off, ready to play the last track again", async () => {
    const { player, finish, current } = harness();
    await player.playList(tracks(2), 1);

    await finish();

    expect(current()).toBe("t2");
    expect(player.getState()).toMatchObject({ status: "paused", currentTime: 0 });
    await player.toggle();
    expect(player.getState().status).toBe("playing");
  });

  it("keeps only what the player needs from each track", async () => {
    const { player } = harness();
    await player.playList([{ ...T(1), license: "CC0", genre: "x" } as ReturnType<typeof T>], 0);

    expect(Object.keys(player.getState().queue[0].track).sort()).toEqual(["album", "artist", "coverUrl", "durationMs", "id", "title"]);
  });
});

describe("next and previous", () => {
  it("next and previous move through the queue and keep playing", async () => {
    const { player, current } = harness();
    await player.playList(tracks(3), 1);

    await player.next();
    expect(current()).toBe("t3");
    await player.previous();
    expect(current()).toBe("t2");
    expect(player.getState().status).toBe("playing");
  });

  it("previous restarts the track when it is well underway, goes back when it is not", async () => {
    const { player, current } = harness();
    await player.playList(tracks(3), 1);

    els[0].currentTime = 10;
    els[0].fire("timeupdate");
    await player.previous();
    expect(current()).toBe("t2");
    expect(els[0].currentTime).toBe(0);

    els[0].currentTime = 1;
    els[0].fire("timeupdate");
    await player.previous();
    expect(current()).toBe("t1");
  });

  it("previous on the first track restarts it, and wraps to the last only with repeat all", async () => {
    const { player, current } = harness();
    await player.playList(tracks(3), 0);

    await player.previous();
    expect(current()).toBe("t1");

    player.setRepeat("all");
    await player.previous();
    expect(current()).toBe("t3");
  });

  it("next on the last track with repeat off ends playback instead of wrapping", async () => {
    const { player, current } = harness();
    await player.playList(tracks(2), 1);

    await player.next();

    expect(current()).toBe("t2");
    expect(player.getState().status).toBe("paused");
  });

  it("do nothing with an empty queue", async () => {
    const { player } = harness();
    await player.next();
    await player.previous();
    expect(player.getState().status).toBe("idle");
  });
});

describe("repeat", () => {
  it("repeat all wraps from the last track to the first", async () => {
    const { player, finish, current } = harness();
    player.setRepeat("all");
    await player.playList(tracks(2), 1);

    await finish();

    expect(current()).toBe("t1");
    expect(player.getState().status).toBe("playing");
  });

  it("repeat all with a single track plays it again", async () => {
    const { player, finish, current } = harness();
    player.setRepeat("all");
    await player.playList(tracks(1), 0);

    await finish();

    expect(current()).toBe("t1");
    expect(player.getState().status).toBe("playing");
  });

  it("repeat one replays the same track when it ends, from the start, on the same element", async () => {
    const { player, finish, current } = harness();
    player.setRepeat("one");
    await player.playList(tracks(3), 0);
    els[0].currentTime = 199;

    await finish();

    expect(current()).toBe("t1");
    expect(els[0].currentTime).toBe(0);
    expect(player.getState().status).toBe("playing");
    expect(els).toHaveLength(1);
  });

  it("repeat one does not trap the next button", async () => {
    const { player, current } = harness();
    player.setRepeat("one");
    await player.playList(tracks(3), 0);

    await player.next();

    expect(current()).toBe("t2");
  });

  it("repeat off stops at the end (the default)", async () => {
    const { player, finish } = harness();
    await player.playList(tracks(1), 0);
    await finish();
    expect(player.getState().status).toBe("paused");
  });
});

describe("shuffle", () => {
  it("keeps the current track first and every other track once", async () => {
    const { player, ids, current } = harness({ random: seeded(7) });
    await player.playList(tracks(6), 2);

    player.setShuffle(true);

    expect(current()).toBe("t3");
    expect(ids()[0]).toBe("t3");
    expect([...ids()].sort()).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
    expect(ids().join()).not.toBe("t3,t1,t2,t4,t5,t6");
  });

  it("plays every track once before any repeats, for many different shuffles", async () => {
    for (let seed = 1; seed <= 30; seed++) {
      els = [];
      const { player, finish, current } = harness({ random: seeded(seed) });
      await player.playList(tracks(7), 0);
      player.setShuffle(true);
      const played = [current()];
      for (let i = 0; i < 6; i++) {
        await finish();
        played.push(current());
      }
      expect(new Set(played).size, `seed ${seed}: ${played.join()}`).toBe(7);
    }
  });

  it("with repeat all, the next cycle covers everything again and never opens with the track that just played", async () => {
    for (let seed = 1; seed <= 30; seed++) {
      els = [];
      const { player, finish, current } = harness({ random: seeded(seed) });
      player.setRepeat("all");
      await player.playList(tracks(5), 0);
      player.setShuffle(true);
      const first: (string | undefined)[] = [];
      for (let i = 0; i < 5; i++) {
        first.push(current());
        if (i < 4) await finish();
      }
      const last = current();
      await finish();
      expect(current(), `seed ${seed}`).not.toBe(last);
      const second = [current()];
      for (let i = 0; i < 4; i++) {
        await finish();
        second.push(current());
      }
      expect(new Set(second).size, `seed ${seed}`).toBe(5);
    }
  });

  it("starting a list with shuffle on puts the chosen track first, and a shuffle-play starts anywhere", async () => {
    const { player, ids, current } = harness({ random: seeded(3) });
    player.setShuffle(true);

    await player.playList(tracks(6), 4);
    expect(current()).toBe("t5");
    expect([...ids()].sort()).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);

    await player.playList(tracks(6), 0, { shuffle: true, randomStart: true });
    expect(player.getState().shuffle).toBe(true);
    expect([...ids()].sort()).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
  });

  it("switching it off restores the original order around the current track", async () => {
    const { player, ids, current, finish } = harness({ random: seeded(11) });
    await player.playList(tracks(6), 0);
    player.setShuffle(true);
    await finish();
    await finish();
    const now = current();

    player.setShuffle(false);

    expect(ids()).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
    expect(current()).toBe(now);
    expect(player.getState().index).toBe(Number(now!.slice(1)) - 1);
  });

  it("tracks added while shuffled are still there after shuffle is switched off", async () => {
    const { player, ids } = harness({ random: seeded(5) });
    await player.playList(tracks(3), 0);
    player.setShuffle(true);
    await player.enqueue(T(9));

    player.setShuffle(false);

    expect(ids()).toEqual(["t1", "t2", "t3", "t9"]);
  });
});

describe("preloading", () => {
  it("loads the next track into a second element as soon as the current one plays, before it ends", async () => {
    const { player } = harness();

    await player.playList(tracks(3), 0);

    expect(els).toHaveLength(2);
    expect(els[1].src).toBe(streamUrl("t2"));
    expect(els[1].preload).toBe("auto");
    expect(els[1].paused).toBe(true);
    expect(els[1].load).toHaveBeenCalledTimes(1);
  });

  it("when the track ends the preloaded element takes over, without loading anything again", async () => {
    const { player, finish, playing } = harness();
    await player.playList(tracks(3), 0);
    const loadsBefore = els[1].load.mock.calls.length;

    await finish();

    expect(playing()).toBe(els[1]);
    expect(els[1].play).toHaveBeenCalledTimes(1);
    expect(els[1].load.mock.calls.length).toBe(loadsBefore);
    // And now the first element is already loading the track after that.
    expect(els[0].src).toBe(streamUrl("t3"));
    expect(player.getState().track?.id).toBe("t2");
  });

  it("is not triggered for a single track, or for repeat one", async () => {
    const one = harness();
    await one.player.playList(tracks(1), 0);
    expect(els).toHaveLength(1);

    els = [];
    const repeat = harness();
    repeat.player.setRepeat("one");
    await repeat.player.playList(tracks(3), 0);
    expect(els).toHaveLength(1);
  });

  it("wraps for repeat all so the first track is ready when the last one ends", async () => {
    const { player } = harness();
    player.setRepeat("all");
    await player.playList(tracks(2), 1);

    expect(els[1].src).toBe(streamUrl("t1"));
  });

  it("follows the queue: play next, remove and reorder change what is preloaded", async () => {
    const { player } = harness();
    await player.playList(tracks(4), 0);
    expect(els[1].src).toBe(streamUrl("t2"));

    await player.playNext(T(9));
    expect(els[1].src).toBe(streamUrl("t9"));

    await player.removeAt(player.getState().queue[1].qid);
    expect(els[1].src).toBe(streamUrl("t2"));

    player.move(2, 1);
    expect(els[1].src).toBe(streamUrl("t3"));
  });

  it("jumping to the preloaded track reuses it", async () => {
    const { player, playing } = harness();
    await player.playList(tracks(3), 0);

    await player.next();

    expect(playing()).toBe(els[1]);
    expect(els[1].load).toHaveBeenCalledTimes(1);
  });

  it("falls back to a normal load if the preloaded track failed", async () => {
    const { player, finish, playing } = harness();
    await player.playList(tracks(3), 0);
    els[1].error = { code: 4 };

    await finish();

    expect(playing()).toBe(els[0]);
    expect(els[0].src).toBe(streamUrl("t2"));
    expect(notify).not.toHaveBeenCalled();
  });

  it("a failing preload does not tell the user anything while the current track plays on", async () => {
    const { player } = harness();
    await player.playList(tracks(3), 0);

    els[1].error = { code: 2 };
    els[1].fire("error");

    expect(notify).not.toHaveBeenCalled();
    expect(player.getState().status).toBe("playing");
  });
});

describe("editing the queue", () => {
  it("add to queue appends", async () => {
    const { player, ids } = harness();
    await player.playList(tracks(2), 0);

    await player.enqueue(T(9));

    expect(ids()).toEqual(["t1", "t2", "t9"]);
  });

  it("add to queue on an empty queue just plays it", async () => {
    const { player, current } = harness();

    await player.enqueue(T(9));

    expect(current()).toBe("t9");
    expect(player.getState().status).toBe("playing");
  });

  it("play next inserts right after the current track, and plays next", async () => {
    const { player, ids, finish, current } = harness();
    await player.playList(tracks(3), 1);

    await player.playNext(T(9));
    expect(ids()).toEqual(["t1", "t2", "t9", "t3"]);

    await finish();
    expect(current()).toBe("t9");
  });

  it("the same track can be queued twice and removed one at a time", async () => {
    const { player, ids } = harness();
    await player.playList(tracks(2), 0);
    await player.enqueue(T(1));
    expect(ids()).toEqual(["t1", "t2", "t1"]);

    await player.removeAt(player.getState().queue[2].qid);

    expect(ids()).toEqual(["t1", "t2"]);
  });

  it("removing a track before the current one keeps the current one playing", async () => {
    const { player, ids, current } = harness();
    await player.playList(tracks(4), 2);

    await player.removeAt(player.getState().queue[0].qid);

    expect(ids()).toEqual(["t2", "t3", "t4"]);
    expect(current()).toBe("t3");
    expect(player.getState().index).toBe(1);
    expect(els[0].src).toBe(streamUrl("t3"));
  });

  it("removing a track after the current one changes what plays next", async () => {
    const { player, finish, current } = harness();
    await player.playList(tracks(3), 0);

    await player.removeAt(player.getState().queue[1].qid);
    await finish();

    expect(current()).toBe("t3");
  });

  it("removing the current track plays the one after it", async () => {
    const { player, current } = harness();
    await player.playList(tracks(3), 1);

    await player.removeAt(player.getState().queue[1].qid);

    expect(current()).toBe("t3");
    expect(player.getState().status).toBe("playing");
  });

  it("removing the current track while paused moves the selection without starting it", async () => {
    const { player, current } = harness();
    await player.playList(tracks(3), 1);
    player.pause();
    els.forEach((e) => e.play.mockClear());

    await player.removeAt(player.getState().queue[1].qid);

    expect(current()).toBe("t3");
    expect(player.getState().status).toBe("paused");
    expect(els.every((e) => e.play.mock.calls.length === 0)).toBe(true);
  });

  it("removing the last track while it plays stops there instead of wrapping (repeat off)", async () => {
    const { player, current } = harness();
    await player.playList(tracks(3), 2);

    await player.removeAt(player.getState().queue[2].qid);

    expect(current()).toBe("t2");
    expect(player.getState().status).toBe("paused");
  });

  it("removing the only track empties the player", async () => {
    const { player } = harness();
    await player.playList(tracks(1), 0);

    await player.removeAt(player.getState().queue[0].qid);

    expect(player.getState()).toMatchObject({ track: null, status: "idle", queue: [], index: -1 });
  });

  it("reordering changes the play order and keeps the current track current", async () => {
    const { player, ids, current, finish } = harness();
    await player.playList(tracks(4), 1);

    player.move(3, 2);
    expect(ids()).toEqual(["t1", "t2", "t4", "t3"]);
    expect(current()).toBe("t2");

    player.move(0, 3);
    expect(ids()).toEqual(["t2", "t4", "t3", "t1"]);
    expect(current()).toBe("t2");
    expect(player.getState().index).toBe(0);

    await finish();
    expect(current()).toBe("t4");
  });

  it("jump plays the chosen entry", async () => {
    const { player, current } = harness();
    await player.playList(tracks(4), 0);

    await player.jump(player.getState().queue[3].qid);

    expect(current()).toBe("t4");
  });
});

describe("remembering the queue", () => {
  const storageKey = "ossm.player";

  it("saves the queue and restores it paused, at the same position, loading nothing until play is pressed", async () => {
    const storage = memoryStorage();
    const first = harness({ storage });
    await first.player.playList(tracks(4), 2);
    first.player.setRepeat("all");
    first.player.seek(42);

    els = [];
    const second = harness({ storage });

    expect(second.player.getState()).toMatchObject({ status: "paused", index: 2, currentTime: 42, repeat: "all", duration: 200 });
    expect(second.ids()).toEqual(["t1", "t2", "t3", "t4"]);
    expect(second.current()).toBe("t3");
    expect(els).toHaveLength(0);

    await second.player.toggle();

    expect(els[0].src).toBe(streamUrl("t3"));
    expect(els[0].currentTime).toBe(42);
    expect(second.player.getState().status).toBe("playing");
  });

  it("remembers shuffle and still goes back to the original order when it is switched off", async () => {
    const storage = memoryStorage();
    const first = harness({ storage, random: seeded(4) });
    await first.player.playList(tracks(5), 0);
    first.player.setShuffle(true);

    els = [];
    const second = harness({ storage });
    expect(second.player.getState().shuffle).toBe(true);
    expect([...second.ids()].sort()).toEqual(["t1", "t2", "t3", "t4", "t5"]);

    second.player.setShuffle(false);
    expect(second.ids()).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });

  it("saves the position as it plays, but not on every tick", async () => {
    const storage = memoryStorage();
    const spy = vi.spyOn(storage, "setItem");
    const { player } = harness({ storage });
    await player.playList(tracks(2), 0);
    spy.mockClear();

    for (const t of [0.25, 0.5, 0.75, 1, 2, 3, 4]) {
      els[0].currentTime = t;
      els[0].fire("timeupdate");
    }
    expect(spy).not.toHaveBeenCalled();

    els[0].currentTime = 6;
    els[0].fire("timeupdate");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.data.get(storageKey)!).time).toBe(6);
  });

  it("saves the position when paused", async () => {
    const storage = memoryStorage();
    const { player } = harness({ storage });
    await player.playList(tracks(2), 0);
    els[0].currentTime = 3;
    els[0].fire("timeupdate");

    player.pause();

    expect(JSON.parse(storage.data.get(storageKey)!).time).toBe(3);
  });

  it("restores nothing from missing, corrupt or malformed data, and does not crash", () => {
    const bad = [
      "not json",
      "null",
      "{}",
      JSON.stringify({ queue: [], index: 0 }),
      JSON.stringify({ queue: [{ qid: "a", track: { id: 1 } }], index: 0 }),
      JSON.stringify({ queue: [{ qid: "a", track: { id: "t", title: "x", artist: "y", durationMs: 1 } }], index: 5 }),
    ];
    for (const raw of bad) {
      const { player } = harness({ storage: memoryStorage({ [storageKey]: raw }) });
      expect(player.getState()).toMatchObject({ status: "idle", queue: [], track: null });
    }
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const { player } = harness({ storage: broken as never });
    expect(player.getState().status).toBe("idle");
  });

  it("forgets the queue on stop (logout), so the next person does not inherit it", async () => {
    const storage = memoryStorage();
    const first = harness({ storage });
    await first.player.playList(tracks(3), 1);

    first.player.stop();

    els = [];
    const second = harness({ storage });
    expect(second.player.getState()).toMatchObject({ status: "idle", queue: [] });
  });

  it("an entry restored for a track that no longer exists fails with a message, and next still works", async () => {
    const storage = memoryStorage();
    const first = harness({ storage });
    await first.player.playList(tracks(3), 0);

    els = [];
    const second = harness({ storage });
    await second.player.toggle();
    els[0].error = { code: 4 };
    els[0].fire("error");
    expect(notify).toHaveBeenCalledTimes(1);

    els[0].error = null;
    await second.player.next();
    expect(second.current()).toBe("t2");
    expect(second.player.getState().status).toBe("playing");
  });
});
