import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { Shortcuts } from "@/player/Shortcuts";
import { player } from "@/player/player";
import { resetNavigation, router } from "@/test/navigation";
import { server } from "@/test/server";
import { SearchPalette } from "./SearchPalette";
import { searchPalette } from "./palette";
import { SearchScreen } from "./SearchScreen";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

type Json = Record<string, unknown>;

const track = (id: string, title: string, extra: Json = {}): Json => ({
  id,
  title,
  artist: "Portishead",
  artistId: "ar1",
  album: "Dummy",
  albumId: "al1",
  coverUrl: "/api/v1/albums/al1/cover",
  durationMs: 240_000,
  license: "All rights reserved",
  uploadedBy: "ada",
  createdAt: "2026-10-02T10:00:00Z",
  ...extra,
});
const album = (id: string, title: string): Json => ({
  id,
  title,
  artist: "Portishead",
  artistId: "ar1",
  year: 1994,
  coverUrl: `/api/v1/albums/${id}/cover`,
  trackCount: 11,
  durationMs: 3_000_000,
});
const artist = (id: string, name: string): Json => ({ id, name, albumCount: 3, trackCount: 30, coverUrl: "/api/v1/albums/al1/cover" });

const results = {
  top: { type: "artist", id: "ar1" },
  tracks: [track("t1", "Glory Box"), track("t2", "Glory Days")],
  albums: [album("al1", "Dummy")],
  artists: [artist("ar1", "Portishead")],
};

/** Answers every search with `body`, and records the q of each request. */
function answer(body: Json = results) {
  const queries: string[] = [];
  server.use(
    http.get("*/api/v1/search", ({ request }) => {
      queries.push(new URL(request.url).searchParams.get("q") ?? "");
      return HttpResponse.json(body);
    }),
  );
  return queries;
}

beforeEach(() => {
  resetNavigation();
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
  act(() => {
    searchPalette.close();
    player.stop();
  });
  vi.restoreAllMocks();
});

const renderApp = () =>
  render(
    <Providers>
      <button>Somewhere on the page</button>
      <Shortcuts />
      <SearchPalette />
    </Providers>,
  );
const palette = () => screen.findByRole("dialog", { name: "Search" });
const box = () => screen.getByRole("combobox", { name: "Search your library" });

describe("opening the palette", () => {
  it.each([
    ["/", "/"],
    ["Ctrl+K", "{Control>}k{/Control}"],
    ["Cmd+K", "{Meta>}k{/Meta}"],
  ])("%s opens it from anywhere, with the box focused", async (_name, keys) => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Somewhere on the page" }));

    await user.keyboard(keys);

    await palette();
    expect(box()).toHaveFocus();
  });

  it("Ctrl+K works while typing in another field, and a / typed into a field is left alone", async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <input aria-label="Note" />
        <Shortcuts />
        <SearchPalette />
      </Providers>,
    );
    await user.click(screen.getByRole("textbox", { name: "Note" }));

    await user.keyboard("a/b");
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("a/b");
    expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    await palette();
  });
});

describe("searching", () => {
  it("waits for a pause in typing, then sends one request for what was typed", async () => {
    const queries = answer();
    const user = userEvent.setup();
    renderApp();
    await user.keyboard("/");
    await palette();

    await user.type(box(), "glory bo");

    await screen.findByRole("option", { name: /Glory Box/ });
    expect(queries).toEqual(["glory bo"]);
  });

  it("groups the hits, with the top result first and the rest of each group under its heading", async () => {
    answer();
    const user = userEvent.setup();
    renderApp();
    await user.keyboard("/");
    await user.type(await screen.findByRole("combobox"), "port");

    const dialog = await palette();
    const top = await within(dialog).findByRole("group", { name: "Top result" });
    expect(within(top).getByRole("option", { name: /Portishead/ })).toBeInTheDocument();
    expect(within(within(dialog).getByRole("group", { name: "Tracks" })).getAllByRole("option").map((o) => o.textContent)).toEqual([
      expect.stringContaining("Glory Box"),
      expect.stringContaining("Glory Days"),
    ]);
    expect(within(within(dialog).getByRole("group", { name: "Albums" })).getByRole("option", { name: /Dummy/ })).toBeInTheDocument();
    // The top result is shown once, not again under Artists.
    expect(within(dialog).queryByRole("group", { name: "Artists" })).not.toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    answer({ tracks: [], albums: [], artists: [] });
    const user = userEvent.setup();
    renderApp();
    await user.keyboard("/");
    await user.type(await screen.findByRole("combobox"), "xylophone");

    expect(await screen.findByText(/No matches for/)).toHaveTextContent("xylophone");
  });
});

describe("keyboard", () => {
  async function typed(query = "glo") {
    const user = userEvent.setup();
    renderApp();
    await user.keyboard("/");
    await user.type(await screen.findByRole("combobox"), query);
    await screen.findByRole("option", { name: /Glory Box/ });
    return user;
  }

  it("starts on the top result, and the arrows move through every option", async () => {
    answer();
    const user = await typed();
    const active = () => box().getAttribute("aria-activedescendant");
    const selected = () => screen.getAllByRole("option").find((o) => o.id === active())?.textContent ?? "";

    expect(selected()).toContain("Portishead");
    await user.keyboard("{ArrowDown}");
    expect(selected()).toContain("Glory Box");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(selected()).toContain("Dummy");
    await user.keyboard("{ArrowUp}");
    expect(selected()).toContain("Glory Days");
  });

  it("Enter on a track plays it, from the tracks found, and closes the palette", async () => {
    answer();
    const user = await typed();

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    await waitFor(() => expect(player.getState().track?.id).toBe("t2"));
    expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();
  });

  it("Enter on the top result, an artist, opens their page", async () => {
    answer();
    const user = await typed();

    await user.keyboard("{Enter}");

    expect(router.push).toHaveBeenCalledWith("/artists/ar1");
    expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();
  });

  it("an album opens its page, and See all results opens the results page for what was typed", async () => {
    answer();
    const user = await typed("glo");
    await user.click(screen.getByRole("option", { name: /Dummy/ }));
    expect(router.push).toHaveBeenLastCalledWith("/albums/al1");

    await user.keyboard("/");
    await user.type(await screen.findByRole("combobox"), "glo r");
    await user.click(await screen.findByRole("option", { name: /See all results for/ }));
    expect(router.push).toHaveBeenLastCalledWith("/search?q=glo%20r");
  });

  it("Escape clears the box first, and closes the palette when it is already empty", async () => {
    answer();
    const user = await typed();

    await user.keyboard("{Escape}");
    expect(box()).toHaveValue("");
    expect(box()).toHaveFocus();
    expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();
  });

  it("is empty again the next time it opens", async () => {
    answer();
    const user = await typed();
    await user.keyboard("{Escape}{Escape}");

    await user.keyboard("/");

    expect(await screen.findByRole("combobox")).toHaveValue("");
  });
});

describe("the results page", () => {
  const renderPage = (search: string) => {
    window.history.replaceState({}, "", `/search${search}`);
    return render(
      <Providers>
        <SearchScreen />
      </Providers>,
    );
  };

  it("shows every group for ?q=, with playable tracks", async () => {
    const queries = answer();
    const user = userEvent.setup();
    const { location } = await import("@/test/navigation");
    location.search = "?q=glory";
    renderPage("?q=glory");

    expect(await screen.findByRole("heading", { name: "Tracks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Albums" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Artists" })).toBeInTheDocument();
    expect(queries).toContain("glory");
    expect(screen.getByRole("searchbox", { name: "Search your library" })).toHaveValue("glory");

    await user.click(screen.getByRole("button", { name: "Play Glory Days" }));
    await waitFor(() => expect(player.getState().track?.id).toBe("t2"));
  });

  it("follows the address when it changes under it, as when the palette sends you here or Back is pressed", async () => {
    answer();
    const { location } = await import("@/test/navigation");
    // A new element each time: re-rendering the very same one would let React skip the screen.
    const tree = () => (
      <Providers>
        <SearchScreen />
      </Providers>
    );
    const { rerender } = render(tree());
    expect(screen.getByRole("searchbox", { name: "Search your library" })).toHaveValue("");

    location.search = "?q=glory";
    rerender(tree());

    await waitFor(() => expect(screen.getByRole("searchbox", { name: "Search your library" })).toHaveValue("glory"));
    expect(await screen.findByRole("heading", { name: "Tracks" })).toBeInTheDocument();
    // Following the address is not a reason to rewrite it.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("with nothing typed, invites a search rather than listing anything", async () => {
    renderPage("");

    expect(await screen.findByText(/Search your tracks, albums and artists/)).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    answer({ tracks: [], albums: [], artists: [] });
    const { location } = await import("@/test/navigation");
    location.search = "?q=zzzz";
    renderPage("?q=zzzz");

    expect(await screen.findByText(/No matches for/)).toHaveTextContent("zzzz");
  });
});
