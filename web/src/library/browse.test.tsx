import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { toast } from "@/components/ui/toast";
import { player } from "@/player/player";
import { server } from "@/test/server";
import { AlbumScreen } from "./AlbumScreen";
import { ArtistScreen } from "./ArtistScreen";
import { LibraryScreen } from "./LibraryScreen";

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
  codec: "mp3",
  bitrateKbps: 320,
  uploadedBy: "ada",
  createdAt: "2026-10-02T10:00:00Z",
  ...extra,
});

const album = (extra: Json = {}): Json => ({
  id: "al1",
  title: "Hurry Up, We're Dreaming",
  artist: "M83",
  artistId: "ar1",
  year: 2011,
  coverUrl: "/api/v1/albums/al1/cover",
  dominantColor: "#336699",
  trackCount: 3,
  durationMs: 720_000,
  ...extra,
});

const artist: Json = { id: "ar1", name: "M83", albumCount: 1, trackCount: 3, coverUrl: "/api/v1/albums/al1/cover" };

const withTotal = (items: unknown[], total = items.length) => HttpResponse.json(items, { headers: { "X-Total-Count": String(total) } });

let requests: URL[];

beforeEach(() => {
  requests = [];
  window.history.replaceState({}, "", "/library");
  // jsdom does no layout: without this every row measures 0px tall, and the virtualizer drifts away from the top.
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(56);
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

const renderWith = (ui: React.ReactElement) => render(<Providers>{ui}</Providers>);

/** A server of `total` tracks that honours limit, offset and sort like the real API. */
function bigLibrary(total: number) {
  const all = Array.from({ length: total }, (_, i) => track(i + 1));
  server.use(
    http.get("*/api/v1/tracks", ({ request }) => {
      const url = new URL(request.url);
      requests.push(url);
      const limit = url.searchParams.get("limit");
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const items = limit ? all.slice(offset, offset + Number(limit)) : all;
      return withTotal(items, total);
    }),
  );
}

describe("the library tabs", () => {
  it("opens on Tracks and switches to Albums and Artists, remembering the tab in the address", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/api/v1/tracks", () => withTotal([track(1)])),
      http.get("*/api/v1/albums", () => withTotal([album()])),
      http.get("*/api/v1/artists", () => withTotal([artist])),
    );
    renderWith(<LibraryScreen />);

    expect(screen.getByRole("tab", { name: "Tracks", selected: true })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Play Song 1" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Albums" }));
    expect(await screen.findByRole("link", { name: /Hurry Up, We're Dreaming/ })).toHaveAttribute("href", "/albums/al1");
    expect(screen.getByRole("tab", { name: "Albums", selected: true })).toBeInTheDocument();
    expect(window.location.search).toBe("?tab=albums");

    await user.click(screen.getByRole("tab", { name: "Artists" }));
    const row = await screen.findByRole("link", { name: /M83/ });
    expect(row).toHaveAttribute("href", "/artists/ar1");
    expect(row).toHaveTextContent("1 album · 3 tracks");
    expect(window.location.search).toBe("?tab=artists");

    await user.click(screen.getByRole("tab", { name: "Tracks" }));
    expect(window.location.search).toBe("");
  });

  it("opens on the tab named in the address", async () => {
    window.history.replaceState({}, "", "/library?tab=albums");
    server.use(http.get("*/api/v1/albums", () => withTotal([album()])));
    renderWith(<LibraryScreen />);

    expect(await screen.findByRole("link", { name: /Hurry Up/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Albums", selected: true })).toBeInTheDocument();
  });
});

describe("tracks", () => {
  it("shows a skeleton while loading, then the rows, and starts playback from a row", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get("*/api/v1/tracks", async () => {
        await gate;
        return withTotal([track(1), track(2), track(3)]);
      }),
    );
    renderWith(<LibraryScreen />);
    expect(screen.getByRole("status", { name: "Loading your library" })).toBeInTheDocument();

    release();
    await user.click(await screen.findByRole("button", { name: "Play Song 2" }));

    expect(screen.queryByRole("status", { name: "Loading your library" })).not.toBeInTheDocument();
    expect(player.getState().track?.title).toBe("Song 2");
    expect(player.getState().queue.map((i) => i.track.title)).toEqual(["Song 1", "Song 2", "Song 3"]);
  });

  it("guides an empty library to the upload page", async () => {
    server.use(http.get("*/api/v1/tracks", () => withTotal([])));
    renderWith(<LibraryScreen />);

    expect(await screen.findByRole("heading", { name: "Your library is empty" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload music" })).toHaveAttribute("href", "/upload");
  });

  it("says so when the library cannot be loaded", async () => {
    server.use(http.get("*/api/v1/tracks", () => new HttpResponse(null, { status: 500 })));
    renderWith(<LibraryScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your library.");
  });

  it("keeps thousands of tracks out of the page: only the rows near the screen exist", async () => {
    bigLibrary(5000);
    renderWith(<LibraryScreen />);

    await screen.findByRole("button", { name: "Play Song 1" });
    const rows = screen.getAllByRole("listitem");

    expect(rows.length).toBeGreaterThan(5);
    expect(rows.length).toBeLessThan(60);
    // One page was asked for, not all five thousand.
    expect(requests).toHaveLength(1);
    expect(requests[0].searchParams.get("limit")).toBe("200");
    expect(screen.getByRole("list", { name: "Tracks" })).toHaveStyle({ height: `${5000 * 56}px` });
  });

  it("plays the whole library from Play all even though only a page has loaded", async () => {
    const user = userEvent.setup();
    bigLibrary(1000);
    renderWith(<LibraryScreen />);

    await user.click(await screen.findByRole("button", { name: "Play all" }));

    await waitFor(() => expect(player.getState().queue).toHaveLength(1000));
    expect(player.getState().track?.title).toBe("Song 1");
    expect(requests.some((u) => !u.searchParams.has("limit"))).toBe(true);
  });

  it("asks the server to sort when the order is changed", async () => {
    const user = userEvent.setup();
    bigLibrary(3);
    renderWith(<LibraryScreen />);
    await screen.findByRole("button", { name: "Play Song 1" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Sort tracks" }), "title");

    await waitFor(() => expect(requests.at(-1)?.searchParams.get("sort")).toBe("title"));
  });

  it("marks the playing track with an equalizer that holds still when paused", async () => {
    const user = userEvent.setup();
    bigLibrary(3);
    renderWith(<LibraryScreen />);

    await user.click(await screen.findByRole("button", { name: "Play Song 2" }));
    const eq = await screen.findByTestId("equalizer");
    await waitFor(() => expect(eq).toHaveAttribute("data-playing", "true"));
    expect(screen.getAllByTestId("equalizer")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Pause Song 2" }));
    await waitFor(() => expect(screen.getByTestId("equalizer")).toHaveAttribute("data-playing", "false"));
  });

  it("stops the equalizer animating when motion is reduced", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf(".eq-bar")));
    expect(block).toMatch(/\.eq\[data-playing="true"\] \.eq-bar\s*\{[^}]*animation:\s*none/);
  });
});

describe("albums", () => {
  it("lists album cards and plays one from its play button", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/library?tab=albums");
    server.use(
      http.get("*/api/v1/albums", () => withTotal([album()])),
      http.get("*/api/v1/albums/al1", () =>
        HttpResponse.json({ album: album(), uploadedBy: "ada", uploadedAt: "2026-03-04T10:00:00Z", tracks: [track(1), track(2), track(3)] }),
      ),
    );
    renderWith(<LibraryScreen />);

    const card = await screen.findByRole("link", { name: /Hurry Up/ });
    expect(card).toHaveTextContent("2011 · M83");
    await user.click(screen.getByRole("button", { name: "Play Hurry Up, We're Dreaming" }));

    await waitFor(() => expect(player.getState().track?.title).toBe("Song 1"));
    expect(player.getState().queue).toHaveLength(3);
  });

  it("has an empty and a loading state", async () => {
    window.history.replaceState({}, "", "/library?tab=albums");
    server.use(http.get("*/api/v1/albums", () => withTotal([])));
    renderWith(<LibraryScreen />);

    expect(screen.getByRole("status", { name: "Loading your albums" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "No albums yet" })).toBeInTheDocument();
  });
});

describe("artists", () => {
  it("has an empty state", async () => {
    window.history.replaceState({}, "", "/library?tab=artists");
    server.use(http.get("*/api/v1/artists", () => withTotal([])));
    renderWith(<LibraryScreen />);

    expect(await screen.findByRole("heading", { name: "No artists yet" })).toBeInTheDocument();
  });
});

describe("the album page", () => {
  const detail = (albumExtra: Json = {}, tracks: Json[] = [track(1), track(2, { license: "CC BY-SA", codec: "flac", bitrateKbps: undefined }), track(3)]) =>
    server.use(http.get("*/api/v1/albums/al1", () => HttpResponse.json({ album: album(albumExtra), uploadedBy: "ada", uploadedAt: "2026-03-04T10:00:00Z", tracks })));

  it("shows the header, the open-metadata line and numbered tracks", async () => {
    detail();
    renderWith(<AlbumScreen id="al1" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Hurry Up, We're Dreaming" })).toBeInTheDocument();
    expect(within(screen.getByTestId("album-header")).getByRole("link", { name: "M83" })).toHaveAttribute("href", "/artists/ar1");
    expect(screen.getByText(/2011 · 3 songs, 12 min/)).toBeInTheDocument();
    expect(screen.getByText("Uploaded by @ada · Mar 4, 2026")).toBeInTheDocument();
    const meta = screen.getByText(/Uploaded by/).parentElement!;
    expect(within(meta).getByText("MP3 320")).toBeInTheDocument();
    expect(within(meta).getByText("FLAC")).toBeInTheDocument();
    expect(within(meta).getByRole("button", { name: "All rights reserved" })).toBeInTheDocument();
    expect(within(meta).getByRole("button", { name: "CC BY-SA" })).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "Tracks" })).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("1");
    expect(rows[2]).toHaveTextContent("3");
  });

  it("tints the header from the cover with text that stays readable", async () => {
    detail({ dominantColor: "#ffe066" });
    renderWith(<AlbumScreen id="al1" />);

    const header = await screen.findByTestId("album-header");
    const bg = header.style.backgroundColor; // jsdom normalises to rgb(...)
    expect(bg).toMatch(/^rgb\(/);
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    const { contrastRatio } = await import("./wash");
    expect(contrastRatio("#ffffff", hex)).toBeGreaterThanOrEqual(4.5);
    expect(header).toHaveClass("text-white");
  });

  it("falls back to a plain header for an album with no cover colour", async () => {
    detail({ dominantColor: undefined, coverUrl: undefined });
    renderWith(<AlbumScreen id="al1" />);

    const header = await screen.findByTestId("album-header");
    expect(header.style.backgroundColor).toBe("");
    expect(header).not.toHaveClass("text-white");
  });

  it("explains the license when its chip is clicked, and closes again", async () => {
    const user = userEvent.setup();
    detail();
    renderWith(<AlbumScreen id="al1" />);

    const chip = await screen.findByRole("button", { name: "CC BY-SA" });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    await user.click(chip);
    expect(screen.getByRole("note")).toHaveTextContent(/ShareAlike.*same license/);
    expect(chip).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("starts playback from any row, and the play button starts from the top", async () => {
    const user = userEvent.setup();
    detail();
    renderWith(<AlbumScreen id="al1" />);

    await user.click(await screen.findByRole("button", { name: "Play Song 3" }));
    expect(player.getState().track?.title).toBe("Song 3");
    expect(player.getState().queue).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Play Hurry Up, We're Dreaming" }));
    expect(player.getState().track?.title).toBe("Song 1");
  });

  it("shuffles from the shuffle button", async () => {
    const user = userEvent.setup();
    detail();
    renderWith(<AlbumScreen id="al1" />);

    await user.click(await screen.findByRole("button", { name: "Shuffle Hurry Up, We're Dreaming" }));

    expect(player.getState().shuffle).toBe(true);
    expect(player.getState().queue).toHaveLength(3);
  });

  it("highlights the playing track with the equalizer in place of its number", async () => {
    const user = userEvent.setup();
    detail();
    renderWith(<AlbumScreen id="al1" />);

    await user.click(await screen.findByRole("button", { name: "Play Song 2" }));

    const row = (await screen.findByRole("button", { name: "Pause Song 2" })).closest("[role=listitem]") as HTMLElement;
    expect(within(row).getByTestId("equalizer")).toBeInTheDocument();
    expect(within(row).getByText("Song 2")).toHaveClass("text-accent");
  });

  it("says when the album does not exist, and when it cannot be loaded", async () => {
    server.use(http.get("*/api/v1/albums/nope", () => new HttpResponse(null, { status: 404 })));
    renderWith(<AlbumScreen id="nope" />);
    expect(await screen.findByRole("heading", { name: "Album not found" })).toBeInTheDocument();
    cleanup();

    server.use(http.get("*/api/v1/albums/broken", () => new HttpResponse(null, { status: 500 })));
    renderWith(<AlbumScreen id="broken" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this album.");
  });

  it("shows a skeleton while loading", () => {
    server.use(http.get("*/api/v1/albums/al1", () => new Promise(() => {})));
    renderWith(<AlbumScreen id="al1" />);

    expect(screen.getByRole("status", { name: "Loading the album" })).toBeInTheDocument();
  });
});

describe("the artist page", () => {
  const detail = () =>
    server.use(
      http.get("*/api/v1/artists/ar1", () =>
        HttpResponse.json({ artist, albums: [album()], tracks: [track(1), track(2), track(9, { album: undefined, albumId: undefined, title: "A Single" })] }),
      ),
    );

  it("lists their albums and every track, singles included, and plays from a row", async () => {
    const user = userEvent.setup();
    detail();
    renderWith(<ArtistScreen id="ar1" />);

    expect(await screen.findByRole("heading", { level: 1, name: "M83" })).toBeInTheDocument();
    expect(screen.getByText("1 album · 3 tracks")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Albums" })).getByRole("link", { name: /Hurry Up/ })).toHaveAttribute("href", "/albums/al1");

    await user.click(screen.getByRole("button", { name: "Play A Single" }));
    expect(player.getState().track?.title).toBe("A Single");
    expect(player.getState().queue).toHaveLength(3);
  });

  it("says when the artist does not exist", async () => {
    server.use(http.get("*/api/v1/artists/nope", () => new HttpResponse(null, { status: 404 })));
    renderWith(<ArtistScreen id="nope" />);

    expect(await screen.findByRole("heading", { name: "Artist not found" })).toBeInTheDocument();
  });
});
