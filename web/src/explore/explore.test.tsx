import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { toast } from "@/components/ui/toast";
import { LibraryScreen } from "@/library/LibraryScreen";
import { player } from "@/player/player";
import { server } from "@/test/server";
import { ExploreScreen } from "./ExploreScreen";
import { TILE_COLORS, tileColor, tileIndex } from "./genreColor";

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

const album = (n: number, extra: Json = {}): Json => ({
  id: `al${n}`,
  title: `Album ${n}`,
  artist: "M83",
  artistId: "ar1",
  year: 2010 + n,
  coverUrl: `/api/v1/albums/al${n}/cover`,
  dominantColor: "#336699",
  trackCount: 3,
  durationMs: 600_000,
  ...extra,
});

const genre = (name: string, slug: string, trackCount: number, extra: Json = {}): Json => ({ name, slug, trackCount, coverUrl: "/api/v1/albums/al1/cover", ...extra });

/** A populated instance. Tests override single endpoints. */
function populated(overrides: { total?: number; featured?: Json | null; genres?: Json[]; recent?: Json[]; mostPlayed?: Json[] } = {}) {
  const { total = 12, featured = album(1), genres = [genre("Rock", "rock", 7), genre("Hip-Hop", "hip-hop", 3), genre("Jazz", "jazz", 1, { coverUrl: undefined })], recent = [album(1), album(2), album(3)], mostPlayed = [{ track: track(1), plays: 5 }, { track: track(2), plays: 1 }] } = overrides;
  server.use(
    http.get("*/api/v1/tracks", () => HttpResponse.json([track(1)], { headers: { "X-Total-Count": String(total) } })),
    http.get("*/api/v1/albums/featured", () => (featured ? HttpResponse.json(featured) : new HttpResponse(null, { status: 204 }))),
    http.get("*/api/v1/genres", () => HttpResponse.json(genres)),
    http.get("*/api/v1/albums/recent", () => HttpResponse.json(recent)),
    http.get("*/api/v1/history/most-played", () => HttpResponse.json(mostPlayed)),
    http.get("*/api/v1/albums/al1", () => HttpResponse.json({ album: album(1), uploadedBy: "ada", uploadedAt: "2026-03-04T10:00:00Z", tracks: [track(1), track(2)] })),
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
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

const renderExplore = () => render(<Providers><ExploreScreen /></Providers>);

describe("genre colours", () => {
  it("gives a genre the same colour every time", () => {
    expect(tileIndex("rock")).toBe(tileIndex("rock"));
    expect(tileColor("rock")).toBe(`var(--tile-${tileIndex("rock")})`);
    // Pinned, so a change to the hash (which would recolour everyone's genres) is noticed.
    expect([tileIndex("rock"), tileIndex("jazz"), tileIndex("hip-hop")]).toEqual([1, 5, 9]);
  });

  it("always picks one of the 12 tile colours and uses most of them across many genres", () => {
    const slugs = Array.from({ length: 60 }, (_, i) => `genre-${i}`);
    const used = new Set(slugs.map(tileIndex));
    for (const n of used) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(TILE_COLORS);
    }
    expect(used.size).toBeGreaterThanOrEqual(9);
  });
});

describe("a populated Explore page", () => {
  it("shows the featured banner, genre tiles, and both carousels in order", async () => {
    populated();
    renderExplore();

    const banner = await screen.findByRole("region", { name: "Featured album" });
    expect(within(banner).getByRole("link", { name: "Album 1" })).toHaveAttribute("href", "/albums/al1");
    expect(within(banner).getByText("M83 · 2011")).toBeInTheDocument();

    const headings = (await screen.findAllByRole("heading", { level: 2 })).map((h) => h.textContent);
    await screen.findByRole("heading", { name: "Most played" });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Album 1", "Genres & moods", "Recently added", "Most played"]);
    expect(headings.length).toBeGreaterThan(0);
  });

  it("makes a tile for each genre in the library, linking to its tracks, with a colour that never changes", async () => {
    populated();
    renderExplore();

    const rock = await screen.findByRole("link", { name: /Rock/ });
    expect(rock).toHaveAttribute("href", "/library?genre=rock");
    expect(rock).toHaveTextContent("7 tracks");
    expect(rock.style.backgroundColor).toBe(tileColor("rock"));
    expect(screen.getByRole("link", { name: /Hip-Hop/ })).toHaveAttribute("href", "/library?genre=hip-hop");
    expect(screen.getByRole("link", { name: /Jazz/ })).toHaveTextContent("1 track");
    expect(screen.getAllByRole("link", { name: /tracks?$/ })).toHaveLength(3);
  });

  it("only tilts and animates tiles for people who have not asked for less motion", async () => {
    populated();
    renderExplore();

    const art = (await screen.findAllByTestId("tile-art"))[0];
    const classes = art.className.split(/\s+/);
    expect(classes).toContain("motion-safe:rotate-[18deg]");
    expect(classes).toContain("motion-safe:group-hover:rotate-[12deg]");
    // Nothing that moves or turns is applied without the motion-safe prefix.
    expect(classes.filter((c) => /rotate|translate|scale|transition/.test(c) && !c.startsWith("motion-safe:"))).toEqual([]);
    const tile = screen.getByRole("link", { name: /Rock/ });
    expect(tile.className.split(/\s+/).filter((c) => /scale|transition/.test(c) && !c.startsWith("motion-safe:"))).toEqual([]);
  });

  it("plays the featured album from its banner", async () => {
    const user = userEvent.setup();
    populated();
    renderExplore();

    const banner = await screen.findByRole("region", { name: "Featured album" });
    await user.click(within(banner).getByRole("button", { name: "Play Album 1" }));

    await waitFor(() => expect(player.getState().track?.title).toBe("Song 1"));
    expect(player.getState().queue).toHaveLength(2);
  });

  it("lists recently added albums and plays one from its card", async () => {
    const user = userEvent.setup();
    populated({ recent: [album(1), album(2)] });
    renderExplore();

    const recent = within(await screen.findByRole("region", { name: "Recently added" }));
    expect(recent.getAllByRole("listitem")).toHaveLength(2);
    expect(recent.getByRole("link", { name: /Album 2/ })).toHaveAttribute("href", "/albums/al2");

    server.use(http.get("*/api/v1/albums/al2", () => HttpResponse.json({ album: album(2), uploadedBy: "ada", uploadedAt: "2026-03-04T10:00:00Z", tracks: [track(7, { title: "From Two" })] })));
    await user.click(recent.getByRole("button", { name: "Play Album 2" }));
    await waitFor(() => expect(player.getState().track?.title).toBe("From Two"));
  });

  it("shows most played with the play counts and starts the list from the chosen card", async () => {
    const user = userEvent.setup();
    populated();
    renderExplore();

    const most = within(await screen.findByRole("region", { name: "Most played" }));
    expect(most.getByText("M83 · 5 plays")).toBeInTheDocument();
    expect(most.getByText("M83 · 1 play")).toBeInTheDocument();

    await user.click(most.getByRole("button", { name: "Play Song 2" }));

    expect(player.getState().track?.title).toBe("Song 2");
    expect(player.getState().queue.map((i) => i.track.title)).toEqual(["Song 1", "Song 2"]);
  });

  it("scrolls a carousel with its arrow buttons, and the cards stay reachable by keyboard", async () => {
    const user = userEvent.setup();
    populated();
    const scrollBy = vi.fn();
    Element.prototype.scrollBy = scrollBy as unknown as typeof Element.prototype.scrollBy;
    renderExplore();

    await screen.findByRole("region", { name: "Recently added" });
    await user.click(screen.getByRole("button", { name: "Scroll Recently added right" }));
    await user.click(screen.getByRole("button", { name: "Scroll Recently added left" }));

    expect(scrollBy).toHaveBeenCalledTimes(2);
    expect(scrollBy.mock.calls[0][0].left).toBeGreaterThanOrEqual(0);
    expect(scrollBy.mock.calls[1][0].left).toBeLessThanOrEqual(0);
    expect(screen.getByRole("list", { name: "Recently added" }).className).toMatch(/snap-x/);
    // Links and buttons only: nothing is a click-only div.
    await user.tab();
    expect(document.activeElement?.tagName).toMatch(/^(A|BUTTON|INPUT|SELECT)$/);
    // @ts-expect-error cleaning up the stub
    delete Element.prototype.scrollBy;
  });
});

describe("other states", () => {
  it("guides an empty instance to upload instead of showing empty sections", async () => {
    populated({ total: 0, featured: null, genres: [], recent: [], mostPlayed: [] });
    renderExplore();

    expect(await screen.findByRole("heading", { name: "Nothing to explore yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload music" })).toHaveAttribute("href", "/upload");
    expect(screen.queryByRole("heading", { name: "Genres & moods" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recently added" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Featured album" })).not.toBeInTheDocument();
  });

  it("leaves out sections that have nothing in them yet", async () => {
    populated({ featured: null, genres: [], recent: [], mostPlayed: [] });
    renderExplore();

    await screen.findByRole("heading", { name: "Explore" });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Nothing to explore yet" })).not.toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    populated();
    server.use(http.get("*/api/v1/tracks", () => new Promise(() => {})));
    renderExplore();

    expect(screen.getByRole("status", { name: "Loading Explore" })).toBeInTheDocument();
  });

  it("says so when the page cannot be loaded", async () => {
    populated();
    server.use(http.get("*/api/v1/tracks", () => new HttpResponse(null, { status: 500 })));
    renderExplore();

    expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("Could not load Explore.");
  });
});

describe("following a genre tile", () => {
  it("shows only that genre in the library, with a chip that clears the filter", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/library?genre=rock");
    const asked: (string | null)[] = [];
    server.use(
      http.get("*/api/v1/tracks", ({ request }) => {
        const genreParam = new URL(request.url).searchParams.get("genre");
        asked.push(genreParam);
        return HttpResponse.json(genreParam ? [track(1, { genre: "Rock" })] : [track(1, { genre: "Rock" }), track(2, { genre: "Jazz" })], { headers: { "X-Total-Count": genreParam ? "1" : "2" } });
      }),
    );
    render(<Providers><LibraryScreen /></Providers>);

    expect(await screen.findByText("Genre: Rock")).toBeInTheDocument();
    expect(asked.at(-1)).toBe("rock");
    expect(screen.queryByRole("button", { name: "Play Song 2" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear the genre filter" }));

    expect(await screen.findByRole("button", { name: "Play Song 2" })).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(screen.queryByText(/^Genre:/)).not.toBeInTheDocument();
  });

  it("says so when no tracks have that genre", async () => {
    window.history.replaceState({}, "", "/library?genre=polka");
    server.use(http.get("*/api/v1/tracks", () => HttpResponse.json([], { headers: { "X-Total-Count": "0" } })));
    render(<Providers><LibraryScreen /></Providers>);

    expect(await screen.findByRole("heading", { name: "No tracks in that genre" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show the whole library" })).toBeInTheDocument();
  });
});
