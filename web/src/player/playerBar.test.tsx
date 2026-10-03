import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

const track = (id: string, title: string, durationMs = 243_000) => ({
  id,
  title,
  artist: "M83",
  album: "Hurry Up",
  albumId: "a1",
  coverUrl: "/api/v1/albums/a1/cover",
  durationMs,
  license: "All rights reserved",
  createdAt: "2026-10-02T10:00:00Z",
});

// jsdom cannot play media: these stand in for the browser and fire the events it would.
let played: string[] = [];
let failNext = false;
beforeEach(() => {
  played = [];
  failNext = false;
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    played.push(new URL(this.src, window.location.href).pathname);
    if (failNext) {
      Object.defineProperty(this, "error", { value: { code: 4 }, configurable: true });
      queueMicrotask(() => this.dispatchEvent(new Event("error")));
      return Promise.reject(Object.assign(new Error("unsupported"), { name: "NotSupportedError" }));
    }
    queueMicrotask(() => this.dispatchEvent(new Event("playing")));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("pause"));
  });
  server.use(http.get("*/api/v1/tracks", () => HttpResponse.json([track("t1", "Midnight City"), track("t2", "Wait")])));
});

afterEach(() => {
  // Unmount while the media stand-ins are still installed: the player bar stops playback on unmount.
  cleanup();
  player.stop();
  toast.clear();
  vi.restoreAllMocks();
});

const renderApp = () =>
  render(
    <Providers>
      <LibraryScreen />
      <PlayerBar />
      <ToastHost />
    </Providers>,
  );

describe("playing from the library", () => {
  it("starts the clicked track from the stream endpoint and shows it in the player bar", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Play Midnight City" }));

    expect(played).toEqual(["/api/v1/tracks/t1/stream"]);
    const bar = screen.getByRole("region", { name: "Player" });
    expect(await within(bar).findByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(within(bar).getByText("Midnight City")).toBeInTheDocument();
    expect(within(bar).getByText("M83")).toBeInTheDocument();
    expect(within(bar).getByText("0:00")).toBeInTheDocument();
    expect(within(bar).getByText("-4:03")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause Midnight City" })).toBeInTheDocument();
  });

  it("pauses from the row and from the bar, and resumes", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Play Midnight City" }));

    await user.click(await screen.findByRole("button", { name: "Pause Midnight City" }));
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
    // The same source all along: pausing and resuming never restarts the download.
    expect(played.every((path) => path === "/api/v1/tracks/t1/stream")).toBe(true);
  });

  it("switches to another track", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Play Midnight City" }));

    await user.click(screen.getByRole("button", { name: "Play Wait" }));

    expect(played.at(-1)).toBe("/api/v1/tracks/t2/stream");
    expect(within(screen.getByRole("region", { name: "Player" })).getByText("Wait")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play Midnight City" })).toBeInTheDocument();
  });

  it("keeps playing when the page changes", async () => {
    const user = userEvent.setup();
    const view = render(
      <Providers>
        <LibraryScreen />
        <PlayerBar />
      </Providers>,
    );
    await user.click(await screen.findByRole("button", { name: "Play Midnight City" }));
    await screen.findByRole("button", { name: "Pause" });

    // Navigating swaps the page for another; the shell, and the player in it, stays.
    view.rerender(
      <Providers>
        <h1>Settings</h1>
        <PlayerBar />
      </Providers>,
    );

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Player" })).getByText("Midnight City")).toBeInTheDocument();
  });
});

describe("the player bar", () => {
  it("says nothing is playing, with the controls off, until a track is chosen", () => {
    render(<PlayerBar />);

    expect(screen.getByText("Nothing playing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Seek" })).toBeDisabled();
  });

  it("seeks with the slider and reads out the position", async () => {
    await act(() => player.play(track("t1", "Midnight City")));
    render(<PlayerBar />);

    fireEvent.change(screen.getByRole("slider", { name: "Seek" }), { target: { value: "120" } });

    expect(screen.getByRole("slider", { name: "Seek" })).toHaveAttribute("aria-valuetext", "2:00 of 4:03");
    expect(screen.getByText("2:00", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("-2:03")).toBeInTheDocument();
  });

  it("changes the volume and mutes", async () => {
    await act(() => player.play(track("t1", "Midnight City")));
    render(<PlayerBar />);

    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), { target: { value: "0.4" } });
    expect(player.getState().volume).toBe(0.4);
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("aria-valuetext", "40%");

    await userEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(player.getState().muted).toBe(true);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
  });
});

describe("when streaming fails", () => {
  it("shows a toast, and the player is not stuck: pressing play tries again", async () => {
    const user = userEvent.setup();
    renderApp();
    failNext = true;

    await user.click(await screen.findByRole("button", { name: "Play Midnight City" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Midnight City");
    const bar = screen.getByRole("region", { name: "Player" });
    // Back to a play button, not a spinner or a dead pause.
    expect(within(bar).getByRole("button", { name: "Play" })).toBeEnabled();

    failNext = false;
    await user.click(within(bar).getByRole("button", { name: "Play" }));
    expect(await within(bar).findByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("dismisses the toast on its own after a few seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp();
      failNext = true;
      await act(async () => {
        await player.play(track("t1", "Midnight City"));
      });
      expect(await screen.findByRole("alert")).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(4100);
      });

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
