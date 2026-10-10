import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { PlayerBar } from "@/components/shell/PlayerBar";
import { ToastHost } from "@/components/ui/ToastHost";
import { toast } from "@/components/ui/toast";
import { LibraryScreen } from "@/library/LibraryScreen";
import { player } from "@/player/player";
import { server } from "@/test/server";
import { HistoryScreen } from "./HistoryScreen";
import { LikedScreen } from "./LikedScreen";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

type Json = Record<string, unknown>;

const track = (n: number, extra: Json = {}): Json => ({
  id: `t${n}`,
  title: `Song ${n}`,
  artist: "M83",
  artistId: "ar1",
  album: "Hurry Up",
  albumId: "al1",
  coverUrl: "/api/v1/albums/al1/cover",
  durationMs: 240_000,
  license: "All rights reserved",
  uploadedBy: "ada",
  createdAt: "2026-10-02T10:00:00Z",
  ...extra,
});
const library = [1, 2, 3].map((n) => track(n));

/** A server that remembers likes, like the real one. Returns what it was asked to do. */
function likesServer(initial: string[] = []) {
  const liked = [...initial];
  const calls: string[] = [];
  server.use(
    http.get("*/api/v1/tracks", () => HttpResponse.json(library, { headers: { "X-Total-Count": String(library.length) } })),
    http.get("*/api/v1/favorites/ids", () => HttpResponse.json([...liked])),
    http.get("*/api/v1/favorites", () => {
      const tracks = [...liked].reverse().map((id) => library.find((t) => t.id === id)!);
      return HttpResponse.json(tracks, { headers: { "X-Total-Count": String(tracks.length) } });
    }),
    http.put("*/api/v1/favorites/:id", ({ params }) => {
      calls.push(`PUT ${params.id}`);
      if (!liked.includes(params.id as string)) liked.push(params.id as string);
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete("*/api/v1/favorites/:id", ({ params }) => {
      calls.push(`DELETE ${params.id}`);
      const at = liked.indexOf(params.id as string);
      if (at >= 0) liked.splice(at, 1);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { calls, liked };
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    queueMicrotask(() => this.dispatchEvent(new Event("playing")));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("pause"));
  });
});

afterEach(() => {
  cleanup();
  act(() => player.stop());
  toast.clear();
  vi.restoreAllMocks();
});

const bar = () => screen.getByRole("region", { name: "Player" });
const like = (title: string, pressed: boolean) => screen.findByRole("button", { name: `Like ${title}`, pressed });

describe("liking from track rows and the player bar", () => {
  const renderApp = () =>
    render(
      <Providers>
        <LibraryScreen />
        <PlayerBar />
        <ToastHost />
      </Providers>,
    );

  it("shows what is already liked, and a click likes or unlikes on the server", async () => {
    const { calls } = likesServer(["t1"]);
    const user = userEvent.setup();
    renderApp();

    await like("Song 1", true);
    await user.click(await like("Song 2", false));

    expect(await like("Song 2", true)).toBeInTheDocument();
    await waitFor(() => expect(calls).toEqual(["PUT t2"]));

    await user.click(await like("Song 1", true));
    expect(await like("Song 1", false)).toBeInTheDocument();
    await waitFor(() => expect(calls).toEqual(["PUT t2", "DELETE t1"]));
  });

  it("is the same everywhere at once: the row and the player bar follow each other without a reload", async () => {
    const { calls } = likesServer(["t1"]);
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Play Song 2" }));
    // Song 2 is not liked: the player bar says so too.
    expect(await within(bar()).findByRole("button", { name: "Like Song 2", pressed: false })).toBeInTheDocument();

    await user.click(within(bar()).getByRole("button", { name: "Like Song 2" }));

    expect(await within(bar()).findByRole("button", { name: "Like Song 2", pressed: true })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Like Song 2", pressed: true })).toHaveLength(2);
    await waitFor(() => expect(calls).toEqual(["PUT t2"]));

    // And back, from the row this time.
    const rows = screen.getAllByRole("button", { name: "Like Song 2" });
    await user.click(rows.find((b) => !bar().contains(b))!);
    expect(await within(bar()).findByRole("button", { name: "Like Song 2", pressed: false })).toBeInTheDocument();
    await waitFor(() => expect(calls).toEqual(["PUT t2", "DELETE t2"]));
  });

  it("changes at once, before the server has answered, and goes back with a message when it refuses", async () => {
    likesServer();
    let answer!: () => void;
    const gate = new Promise<void>((resolve) => (answer = resolve));
    server.use(
      http.put("*/api/v1/favorites/:id", async () => {
        await gate;
        return HttpResponse.json({ type: "about:blank", title: "Server error", status: 500 }, { status: 500, headers: { "Content-Type": "application/problem+json" } });
      }),
    );
    const user = userEvent.setup();
    renderApp();

    await user.click(await like("Song 2", false));
    // The server has not said anything yet, and it already shows as liked.
    expect(screen.getByRole("button", { name: "Like Song 2", pressed: true })).toBeInTheDocument();

    answer();
    expect(await like("Song 2", false)).toBeInTheDocument();
    expect(await screen.findByText(/Could not like/)).toHaveTextContent("Song 2");
  });

  it("an unlike the server refuses goes back to liked", async () => {
    likesServer(["t3"]);
    server.use(http.delete("*/api/v1/favorites/:id", () => new HttpResponse(null, { status: 500 })));
    const user = userEvent.setup();
    renderApp();

    await user.click(await like("Song 3", true));

    expect(await like("Song 3", true)).toBeInTheDocument();
    expect(await screen.findByText(/Could not unlike/)).toBeInTheDocument();
  });
});

describe("the Liked page", () => {
  const renderLiked = () =>
    render(
      <Providers>
        <LikedScreen />
        <PlayerBar />
      </Providers>,
    );

  it("lists exactly the favorites, most recently liked first, and plays them from Play all", async () => {
    likesServer(["t1", "t3"]);
    const user = userEvent.setup();
    renderLiked();

    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((r) => within(r).getByText(/^Song \d$/).textContent)).toEqual(["Song 3", "Song 1"]);
    expect(screen.queryByText("Song 2")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Play all" }));
    await waitFor(() => expect(player.getState().track?.id).toBe("t3"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(player.getState().track?.id).toBe("t1"));
  });

  it("drops a track from the list when it is unliked there", async () => {
    likesServer(["t1", "t3"]);
    const user = userEvent.setup();
    renderLiked();

    await user.click(await screen.findByRole("button", { name: "Like Song 3", pressed: true }));

    await waitFor(() => expect(screen.queryByText("Song 3")).not.toBeInTheDocument());
    expect(screen.getByText("Song 1")).toBeInTheDocument();
  });

  it("guides you to like something when there is nothing yet", async () => {
    likesServer();
    renderLiked();

    expect(await screen.findByRole("heading", { name: "Nothing liked yet" })).toBeInTheDocument();
    expect(screen.getByText(/heart/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse your library" })).toHaveAttribute("href", "/library");
  });
});

describe("the History page", () => {
  const play = (n: number, playedAt: string) => ({ track: track(n), playedAt });
  const renderHistory = () =>
    render(
      <Providers>
        <HistoryScreen />
        <PlayerBar />
      </Providers>,
    );

  it("lists plays most recent first, once per play, with when each happened", async () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    server.use(
      http.get("*/api/v1/history", () =>
        HttpResponse.json([play(2, hoursAgo(1)), play(1, hoursAgo(2)), play(2, hoursAgo(30)), play(3, "2025-01-05T12:00:00Z")], { headers: { "X-Total-Count": "4" } }),
      ),
    );
    renderHistory();

    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((r) => within(r).getByText(/^Song \d$/).textContent)).toEqual(["Song 2", "Song 1", "Song 2", "Song 3"]);
    expect(within(rows[0]).getByText(/Today/)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/Yesterday/)).toBeInTheDocument();
    expect(within(rows[3]).getByText(/Jan 5, 2025/)).toBeInTheDocument();
  });

  it("starts playing from a row", async () => {
    server.use(http.get("*/api/v1/history", () => HttpResponse.json([play(2, new Date().toISOString()), play(1, new Date().toISOString())], { headers: { "X-Total-Count": "2" } })));
    const user = userEvent.setup();
    renderHistory();

    await user.click(await screen.findByRole("button", { name: "Play Song 1" }));

    await waitFor(() => expect(player.getState().track?.id).toBe("t1"));
  });

  it("guides you to play something when there is no history", async () => {
    server.use(http.get("*/api/v1/history", () => HttpResponse.json([], { headers: { "X-Total-Count": "0" } })));
    renderHistory();

    expect(await screen.findByRole("heading", { name: "Nothing played yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse your library" })).toHaveAttribute("href", "/library");
  });
});
