import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { PlayerBar } from "@/components/shell/PlayerBar";
import { ToastHost } from "@/components/ui/ToastHost";
import { toast } from "@/components/ui/toast";
import { LibraryScreen } from "@/library/LibraryScreen";
import { server } from "@/test/server";
import { player } from "./player";
import { Shortcuts } from "./Shortcuts";

const track = (n: number) => ({
  id: `t${n}`,
  title: `Song ${n}`,
  artist: "M83",
  album: "Hurry Up",
  albumId: "a1",
  coverUrl: "/api/v1/albums/a1/cover",
  durationMs: 240_000,
  license: "All rights reserved",
  createdAt: "2026-10-02T10:00:00Z",
});
const library = [1, 2, 3, 4].map(track);

let played: string[] = [];
beforeEach(() => {
  played = [];
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    played.push(new URL(this.src, window.location.href).pathname);
    queueMicrotask(() => this.dispatchEvent(new Event("playing")));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("pause"));
  });
  server.use(http.get("*/api/v1/tracks", () => HttpResponse.json(library)));
});

afterEach(() => {
  cleanup();
  act(() => {
    player.setShuffle(false);
    player.setRepeat("off");
    player.stop();
  });
  toast.clear();
  vi.restoreAllMocks();
});

const renderApp = () =>
  render(
    <Providers>
      <input type="search" aria-label="Search your library" />
      <LibraryScreen />
      <PlayerBar />
      <ToastHost />
      <Shortcuts />
    </Providers>,
  );
const bar = () => screen.getByRole("region", { name: "Player" });
const nowPlaying = () => player.getState().track?.title;

describe("library actions", () => {
  it("a row starts the whole list from that track, so next goes to the row after it", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Play Song 2" }));

    expect(nowPlaying()).toBe("Song 2");
    expect(player.getState().queue.map((i) => i.track.title)).toEqual(["Song 1", "Song 2", "Song 3", "Song 4"]);
    await user.click(within(bar()).getByRole("button", { name: "Next" }));
    expect(nowPlaying()).toBe("Song 3");
  });

  it("Play all starts at the top, and Shuffle all turns shuffle on and plays everything", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Play all" }));
    expect(nowPlaying()).toBe("Song 1");

    await user.click(screen.getByRole("button", { name: "Shuffle all" }));
    expect(player.getState().shuffle).toBe(true);
    expect(player.getState().queue).toHaveLength(4);
    expect(within(bar()).getByRole("button", { name: "Shuffle" })).toHaveAttribute("aria-pressed", "true");
  });

  it("the current track's row pauses and resumes it instead of restarting", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Play Song 1" }));
    const loads = played.length;

    await user.click(screen.getByRole("button", { name: "Pause Song 1" }));
    expect(player.getState().status).toBe("paused");
    await user.click(screen.getByRole("button", { name: "Play Song 1" }));

    expect(player.getState().status).toBe("playing");
    expect(played.length).toBe(loads + 1);
    expect(new Set(played).size).toBeLessThanOrEqual(2);
  });

  it("Play next and Add to queue put the track in the right place and say so", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Play Song 1" }));

    await user.click(screen.getByRole("button", { name: "Add Song 2 to queue" }));
    expect(await screen.findByText("Added “Song 2” to the queue")).toBeInTheDocument();
    expect(player.getState().queue.map((i) => i.track.title)).toEqual(["Song 1", "Song 2", "Song 3", "Song 4", "Song 2"]);

    await user.click(screen.getByRole("button", { name: "Play Song 4 next" }));
    expect(await screen.findByText("“Song 4” will play next")).toBeInTheDocument();
    expect(player.getState().queue[1].track.title).toBe("Song 4");
  });
});

describe("transport buttons", () => {
  it("shuffle and repeat show their state, and repeat cycles off, all, one", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Play all" }));

    const shuffle = within(bar()).getByRole("button", { name: "Shuffle" });
    expect(shuffle).toHaveAttribute("aria-pressed", "false");
    await user.click(shuffle);
    expect(shuffle).toHaveAttribute("aria-pressed", "true");
    await user.click(shuffle);
    expect(shuffle).toHaveAttribute("aria-pressed", "false");

    await user.click(within(bar()).getByRole("button", { name: "Repeat: off" }));
    expect(player.getState().repeat).toBe("all");
    await user.click(within(bar()).getByRole("button", { name: "Repeat: all" }));
    expect(player.getState().repeat).toBe("one");
    await user.click(within(bar()).getByRole("button", { name: "Repeat: one" }));
    expect(player.getState().repeat).toBe("off");
  });

  it("next is disabled on the last track unless repeat all is on", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Play Song 4" }));

    expect(within(bar()).getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(within(bar()).getByRole("button", { name: "Repeat: off" }));
    expect(within(bar()).getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("controls are off with nothing to play", () => {
    render(<PlayerBar />);

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});

describe("the queue drawer", () => {
  async function openQueue() {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Play Song 1" }));
    await user.click(within(bar()).getByRole("button", { name: "Queue" }));
    const drawer = await screen.findByRole("dialog", { name: "Queue" });
    return { user, drawer };
  }
  const nextUp = (drawer: HTMLElement) => within(within(drawer).getByRole("region", { name: "Next up" })).getAllByRole("listitem");

  it("shows what is playing and what is next, in order", async () => {
    const { drawer } = await openQueue();

    expect(within(within(drawer).getByRole("region", { name: "Now playing" })).getByText("Song 1")).toBeInTheDocument();
    expect(nextUp(drawer).map((li) => li.textContent)).toEqual([
      expect.stringContaining("Song 2"),
      expect.stringContaining("Song 3"),
      expect.stringContaining("Song 4"),
    ]);
  });

  it("reorders with the move buttons, and the first and last cannot go further", async () => {
    const { user, drawer } = await openQueue();
    expect(within(drawer).getByRole("button", { name: "Move Song 2 up" })).toBeDisabled();
    expect(within(drawer).getByRole("button", { name: "Move Song 4 down" })).toBeDisabled();

    await user.click(within(drawer).getByRole("button", { name: "Move Song 4 up" }));

    expect(player.getState().queue.map((i) => i.track.title)).toEqual(["Song 1", "Song 2", "Song 4", "Song 3"]);
    expect(nextUp(drawer)[1]).toHaveTextContent("Song 4");
    expect(nowPlaying()).toBe("Song 1");
  });

  it("removes an entry, and what plays next changes", async () => {
    const { user, drawer } = await openQueue();

    await user.click(within(drawer).getByRole("button", { name: "Remove Song 2 from queue" }));

    expect(nextUp(drawer)).toHaveLength(2);
    await user.click(within(bar()).getByRole("button", { name: "Next" }));
    expect(nowPlaying()).toBe("Song 3");
  });

  it("plays an entry when it is chosen", async () => {
    const { user, drawer } = await openQueue();

    await user.click(within(drawer).getByRole("button", { name: "Play Song 4" }));

    expect(nowPlaying()).toBe("Song 4");
  });

  it("says so when nothing is queued", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Play Song 4" }));
    await user.click(within(bar()).getByRole("button", { name: "Queue" }));

    expect(await screen.findByText(/Nothing queued/)).toBeInTheDocument();
  });

  it("is keyboard friendly: focus moves in, Tab stays inside, Escape closes and focus goes back", async () => {
    const { user, drawer } = await openQueue();

    expect(drawer.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 30; i++) {
      await user.tab();
      expect(drawer.contains(document.activeElement), `after ${i + 1} tabs`).toBe(true);
    }
    for (let i = 0; i < 30; i++) {
      await user.tab({ shift: true });
      expect(drawer.contains(document.activeElement), `after ${i + 1} shift-tabs`).toBe(true);
    }

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(bar()).getByRole("button", { name: "Queue" })).toHaveFocus();
  });

  it("closes from the close button", async () => {
    const { user, drawer } = await openQueue();

    await user.click(within(drawer).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("keyboard shortcuts", () => {
  async function playing() {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Play Song 2" }));
    // Focus on the page itself, not on a button, as when the user has just clicked on the background.
    (document.activeElement as HTMLElement | null)?.blur();
    return user;
  }

  it("Space plays and pauses", async () => {
    const user = await playing();

    await user.keyboard(" ");
    expect(player.getState().status).toBe("paused");
    await user.keyboard(" ");
    expect(player.getState().status).toBe("playing");
  });

  it("the arrows seek five seconds, and Shift with the arrows goes to the previous or next track", async () => {
    const user = await playing();
    act(() => player.seek(60));

    await user.keyboard("{ArrowRight}");
    expect(player.getState().currentTime).toBe(65);
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(player.getState().currentTime).toBe(55);

    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(nowPlaying()).toBe("Song 3");
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(nowPlaying()).toBe("Song 2");
  });

  it("M mutes and unmutes", async () => {
    const user = await playing();

    await user.keyboard("m");
    expect(player.getState().muted).toBe(true);
    await user.keyboard("M");
    expect(player.getState().muted).toBe(false);
  });

  it("/ focuses the search box", async () => {
    const user = await playing();

    await user.keyboard("/");

    expect(screen.getByRole("searchbox", { name: "Search your library" })).toHaveFocus();
  });

  it("? opens a help dialog that lists every shortcut, and closes again", async () => {
    const user = await playing();

    await user.keyboard("?");
    const help = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });

    for (const action of ["Play or pause", "Seek back or forward 5 seconds", "Previous track", "Next track", "Mute or unmute", "Search", "Show this list"]) {
      expect(within(help).getByText(action)).toBeInTheDocument();
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shortcuts stay out of the way while typing", async () => {
    const user = await playing();
    const search = screen.getByRole("searchbox", { name: "Search your library" });
    await user.click(search);

    await user.keyboard("m a/ ?");

    expect(search).toHaveValue("m a/ ?");
    expect(player.getState().muted).toBe(false);
    expect(player.getState().status).toBe("playing");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Space on a focused button presses that button, not play/pause", async () => {
    const user = await playing();
    const shuffle = within(bar()).getByRole("button", { name: "Shuffle" });
    shuffle.focus();

    await user.keyboard(" ");

    expect(player.getState().shuffle).toBe(true);
    expect(player.getState().status).toBe("playing");
  });

  it("does nothing, and lets the key through, when nothing is playing", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("button", { name: "Play Song 2" });

    await user.keyboard(" ");
    await user.keyboard("{ArrowRight}");

    expect(player.getState().status).toBe("idle");
  });

  it("ignores shortcuts combined with Ctrl, Cmd or Alt", async () => {
    const user = await playing();

    await user.keyboard("{Control>} {/Control}");
    await user.keyboard("{Meta>}m{/Meta}");

    expect(player.getState().status).toBe("playing");
    expect(player.getState().muted).toBe(false);
  });
});
