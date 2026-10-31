import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { toast } from "@/components/ui/toast";
import { player } from "@/player/player";
import { FakeAudio } from "@/test/fakeAudio";
import { resetNavigation } from "@/test/navigation";
import { server } from "@/test/server";
import { createVideoEngine } from "./engine";
import { ShowScreen } from "./ShowScreen";
import { VideoPlayer } from "./VideoPlayer";
import { VideosScreen } from "./VideosScreen";
import { WatchScreen } from "./WatchScreen";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

type Json = Record<string, unknown>;

const video = (n: number, extra: Json = {}): Json => ({
  id: `v${n}`,
  kind: "MOVIE",
  title: `Movie ${n}`,
  year: 2010,
  durationMs: 888_000,
  width: 3840,
  height: 2160,
  videoCodec: "hevc",
  container: "mp4",
  playable: true,
  thumbnailUrl: `/api/v1/videos/v${n}/thumbnail`,
  license: "CC BY",
  uploadedBy: "maya",
  createdAt: "2026-10-12T10:00:00Z",
  ...extra,
});

const episode = (season: number, n: number, extra: Json = {}): Json =>
  video(season * 100 + n, { kind: "EPISODE", title: `Episode ${n}`, showId: "s1", showName: "Night Kitchen", season, episode: n, durationMs: 2_520_000, height: 1080, videoCodec: "h264", ...extra });

const progress = (positionMs: number, durationMs = 888_000, watched = false) => ({ positionMs, durationMs, watched, updatedAt: "2026-10-20T10:00:00Z" });

const withTotal = (items: unknown[], total = items.length) => HttpResponse.json(items, { headers: { "X-Total-Count": String(total) } });

function watchDetail(v: Json, extra: Json = {}) {
  return { video: v, subtitles: [], upNext: [], canEdit: false, ...extra };
}

beforeEach(() => {
  resetNavigation();
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(230);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    queueMicrotask(() => this.dispatchEvent(new Event("playing")));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("pause"));
  });
  localStorage.clear();
  // Leaving a player saves the position.
  server.use(http.put("*/api/v1/videos/:id/progress", () => HttpResponse.json(progress(0))));
});

afterEach(() => {
  act(() => player.stop());
  toast.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const wrap = (ui: React.ReactNode) => render(<Providers>{ui}</Providers>);

describe("the Videos page", () => {
  it("lists movies as cards that open the watch page, with progress and warnings", async () => {
    server.use(
      http.get("*/api/v1/videos", ({ request }) => {
        expect(new URL(request.url).searchParams.get("kind")).toBe("MOVIE");
        return withTotal([video(1, { progress: progress(444_000) }), video(2, { progress: progress(888_000, 888_000, true) }), video(3, { playable: false, container: "mkv" })]);
      }),
    );
    wrap(<VideosScreen />);

    const movies = await screen.findByRole("list", { name: "Movies" });
    const first = within(movies).getByRole("link", { name: "Movie 1, 2010 · 15m" });
    expect(first).toHaveAttribute("href", "/watch/v1");
    expect(within(first).getByRole("progressbar", { name: "Watched so far" })).toHaveAttribute("aria-valuenow", "50");
    expect(within(within(movies).getByRole("link", { name: /Movie 2/ })).getByRole("img", { name: "Watched" })).toBeInTheDocument();
    expect(within(within(movies).getByRole("link", { name: /Movie 3/ })).getByRole("img", { name: "May not play in this browser" })).toBeInTheDocument();
  });

  it("switches to shows, keeping the tab in the address", async () => {
    server.use(
      http.get("*/api/v1/videos", () => withTotal([video(1)])),
      http.get("*/api/v1/shows", () => withTotal([{ id: "s1", name: "Night Kitchen", seasonCount: 3, episodeCount: 24, thumbnailUrl: "/t.jpg" }])),
    );
    const user = userEvent.setup();
    wrap(<VideosScreen />);
    await screen.findByRole("list", { name: "Movies" });

    await user.click(screen.getByRole("tab", { name: "Shows" }));

    const show = await screen.findByRole("link", { name: "Night Kitchen, 3 seasons · 24 episodes" });
    expect(show).toHaveAttribute("href", "/videos/shows/s1");
    expect(window.location.search).toBe("?tab=shows");
    expect(screen.getByRole("tab", { name: "Shows" })).toHaveAttribute("aria-selected", "true");
  });

  it("sorts by the chip that is pressed", async () => {
    const sorts: (string | null)[] = [];
    server.use(
      http.get("*/api/v1/videos", ({ request }) => {
        sorts.push(new URL(request.url).searchParams.get("sort"));
        return withTotal([video(1)]);
      }),
    );
    const user = userEvent.setup();
    wrap(<VideosScreen />);
    await screen.findByRole("list", { name: "Movies" });

    await user.click(screen.getByRole("button", { name: "A–Z" }));

    await waitFor(() => expect(sorts).toContain("title"));
    expect(screen.getByRole("button", { name: "A–Z" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Recently added" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows skeletons while loading, then an empty state that leads to upload", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.get("*/api/v1/videos", async () => {
        await gate;
        return withTotal([]);
      }),
    );
    wrap(<VideosScreen />);

    expect(screen.getByRole("status", { name: "Loading your movies" })).toBeInTheDocument();
    release();
    expect(await screen.findByRole("heading", { name: "No videos yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload videos" })).toHaveAttribute("href", "/upload");
  });
});

describe("a show page", () => {
  const detail = {
    show: { id: "s1", name: "Night Kitchen", seasonCount: 2, episodeCount: 4 },
    uploadedBy: "maya",
    seasons: [
      { number: 1, episodes: [episode(1, 1, { progress: progress(2_520_000, 2_520_000, true) }), episode(1, 2)] },
      { number: 2, episodes: [episode(2, 1, { progress: progress(1_260_000, 2_520_000) }), episode(2, 2)] },
    ],
    resume: episode(2, 1, { progress: progress(1_260_000, 2_520_000) }),
  };

  it("opens on the season to resume, with the episode to watch next marked", async () => {
    server.use(http.get("*/api/v1/shows/s1", () => HttpResponse.json(detail)));
    wrap(<ShowScreen id="s1" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Night Kitchen" })).toBeInTheDocument();
    expect(screen.getByText("2 seasons · 4 episodes · Uploaded by @maya")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resume S2 · E1" })).toHaveAttribute("href", "/watch/v201");
    expect(screen.getByRole("tab", { name: "Season 2" })).toHaveAttribute("aria-selected", "true");

    const list = screen.getByRole("list", { name: "Season 2 episodes" });
    const rows = within(list).getAllByRole("link");
    expect(rows.map((r) => r.getAttribute("href"))).toEqual(["/watch/v201", "/watch/v202"]);
    expect(within(rows[0]).getByText("Up next")).toBeInTheDocument();
  });

  it("switches seasons", async () => {
    server.use(http.get("*/api/v1/shows/s1", () => HttpResponse.json(detail)));
    const user = userEvent.setup();
    wrap(<ShowScreen id="s1" />);

    await user.click(await screen.findByRole("tab", { name: "Season 1" }));

    const list = screen.getByRole("list", { name: "Season 1 episodes" });
    expect(within(list).getByRole("link", { name: /E1 · Episode 1/ })).toBeInTheDocument();
    expect(within(list).getByRole("img", { name: "Watched" })).toBeInTheDocument();
  });

  it("starts at the first episode when nothing is in progress", async () => {
    server.use(http.get("*/api/v1/shows/s1", () => HttpResponse.json({ ...detail, resume: undefined })));
    wrap(<ShowScreen id="s1" />);
    expect(await screen.findByRole("link", { name: "Play S1 · E1" })).toHaveAttribute("href", "/watch/v101");
  });
});

describe("the watch page", () => {
  it("shows the video's details on a dark page and puts the theme back on leaving", async () => {
    server.use(http.get("*/api/v1/videos/v1", () => HttpResponse.json(watchDetail(video(1, { title: "Sintel" }), { upNext: [video(2)] }))));
    const { unmount } = wrap(<WatchScreen id="v1" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Sintel" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByText("2010 · 14m 48s")).toBeInTheDocument();
    expect(screen.getByText("4K · HEVC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CC BY" })).toBeInTheDocument();
    expect(screen.getByText(/Uploaded by @maya/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Video player" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Up next" })).getByRole("link", { name: /Movie 2/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();

    unmount();
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("stops the music when the video starts", async () => {
    const pause = vi.spyOn(player, "pause");
    vi.spyOn(player, "getState").mockReturnValue({ ...player.getState(), status: "playing" });
    server.use(http.get("*/api/v1/videos/v1", () => HttpResponse.json(watchDetail(video(1)))));
    wrap(<WatchScreen id="v1" />);

    await screen.findByRole("region", { name: "Video player" });
    await waitFor(() => expect(pause).toHaveBeenCalled());
  });

  it("explains a file the browser may not play, and still lets you try", async () => {
    server.use(http.get("*/api/v1/videos/v1", () => HttpResponse.json(watchDetail(video(1, { playable: false, container: "mkv", videoCodec: "hevc" })))));
    const user = userEvent.setup();
    wrap(<WatchScreen id="v1" />);

    expect(await screen.findByRole("heading", { name: "This file may not play in this browser" })).toBeInTheDocument();
    expect(screen.getByText(/This one is MKV with HEVC video/)).toBeInTheDocument();
    expect(screen.getByText("May not play in this browser")).toBeInTheDocument();
    expect(screen.getByText("MKV")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try anyway" }));
    expect(screen.getByRole("region", { name: "Video player" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^(Play|Pause)$/ })).toBeInTheDocument();
  });

  it("lists the rest of the season next to an episode, linked back to its show", async () => {
    server.use(http.get("*/api/v1/videos/v105", () => HttpResponse.json(watchDetail(episode(1, 5), { upNext: [episode(1, 6), episode(1, 7)] }))));
    wrap(<WatchScreen id="v105" />);

    expect(await screen.findByRole("link", { name: "Night Kitchen" })).toHaveAttribute("href", "/videos/shows/s1");
    expect(screen.getByText(/Season 1 · Episode 5 · 42m/)).toBeInTheDocument();
    const next = screen.getByRole("list", { name: "Up next in Season 1" });
    expect(within(next).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/watch/v106", "/watch/v107"]);
  });

  it("lets the uploader correct the details", async () => {
    let sent: unknown;
    server.use(
      http.get("*/api/v1/videos/v1", () => HttpResponse.json(watchDetail(video(1, { title: "night.kitchen.s02e05" }), { canEdit: true }))),
      http.get("*/api/v1/shows", () => HttpResponse.json([{ id: "s1", name: "Night Kitchen", seasonCount: 1, episodeCount: 4 }])),
      http.patch("*/api/v1/videos/v1", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(episode(2, 5));
      }),
    );
    const user = userEvent.setup();
    wrap(<WatchScreen id="v1" />);

    await user.click(await screen.findByRole("button", { name: "Edit details" }));
    const dialog = screen.getByRole("dialog", { name: "Edit details" });
    await user.click(within(dialog).getByRole("radio", { name: "Episode" }));
    await user.type(within(dialog).getByLabelText("Show"), "Night Kitchen");
    await user.type(within(dialog).getByLabelText("Season"), "2");
    await user.type(within(dialog).getByLabelText("Episode"), "5");
    await user.clear(within(dialog).getByLabelText("Episode title"));
    await user.type(within(dialog).getByLabelText("Episode title"), "The Long Way Home");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit details" })).not.toBeInTheDocument());
    expect(sent).toEqual({ kind: "EPISODE", title: "The Long Way Home", showName: "Night Kitchen", season: 2, episode: 5 });
  });

  it("says when a video does not exist", async () => {
    server.use(http.get("*/api/v1/videos/nope", () => HttpResponse.json({ title: "Not found", status: 404 }, { status: 404 })));
    wrap(<WatchScreen id="nope" />);
    expect(await screen.findByRole("heading", { name: "Video not found" })).toBeInTheDocument();
  });
});

describe("the video player", () => {
  function renderPlayer(v: Json, extra: Partial<React.ComponentProps<typeof VideoPlayer>> = {}) {
    const media = new FakeAudio();
    const engine = createVideoEngine();
    wrap(<VideoPlayer video={v as never} subtitles={[]} engineFactory={() => engine} mediaRef={() => media} {...extra} />);
    return { media, engine };
  }

  it("resumes where you stopped, and Start over goes back to the beginning", async () => {
    const saves: unknown[] = [];
    server.use(http.put("*/api/v1/videos/v1/progress", async ({ request }) => (saves.push(await request.json()), HttpResponse.json({}))));
    const user = userEvent.setup();
    const { media, engine } = renderPlayer(video(1, { progress: progress(1_300_000, 2_520_000) }));

    expect(screen.getByRole("status")).toHaveTextContent("Resumed at 21:40");
    expect(engine.getState().currentTime).toBe(1300);

    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(media.currentTime).toBe(0);
    expect(screen.queryByText(/Resumed at/)).not.toBeInTheDocument();
  });

  it("saves your position when you pause", async () => {
    const saves: unknown[] = [];
    server.use(http.put("*/api/v1/videos/v1/progress", async ({ request }) => (saves.push(await request.json()), HttpResponse.json(progress(0)))));
    const { media } = renderPlayer(video(1));
    await waitFor(() => expect(media.play).toHaveBeenCalled());

    act(() => {
      media.currentTime = 95.4;
      media.fire("timeupdate");
    });
    act(() => media.pause());

    await waitFor(() => expect(saves).toContainEqual({ positionMs: 95_400, durationMs: 888_000 }));
  });

  it("offers subtitles and remembers the language", async () => {
    const user = userEvent.setup();
    renderPlayer(video(1), {
      subtitles: [
        { index: 0, language: "en", label: "English", url: "/api/v1/videos/v1/subtitles/0" },
        { index: 1, language: "bn", label: "Bangla", url: "/api/v1/videos/v1/subtitles/1" },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Subtitles" }));
    const menu = screen.getByRole("menu", { name: "Subtitles" });
    expect(within(menu).getByRole("menuitemradio", { name: "Off" })).toHaveAttribute("aria-checked", "true");

    await user.click(within(menu).getByRole("menuitemradio", { name: "English" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(localStorage.getItem("ossm.subtitles")).toBe("en");
  });

  it("answers the keyboard: L jumps 10 seconds, M mutes, Space pauses", async () => {
    const user = userEvent.setup();
    const { media, engine } = renderPlayer(video(1));
    await waitFor(() => expect(engine.getState().status).toBe("playing"));

    await user.keyboard("l");
    expect(media.currentTime).toBe(10);
    await user.keyboard("m");
    expect(media.muted).toBe(true);
    await user.keyboard(" ");
    expect(media.pause).toHaveBeenCalled();
  });

  it("offers the next episode near the end and plays it when the countdown runs out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onNext = vi.fn();
    const next = episode(1, 6, { title: "Salt and Smoke" });
    const { media } = renderPlayer(episode(1, 5), { next: next as never, onNext });
    await waitFor(() => expect(media.play).toHaveBeenCalled());

    act(() => {
      media.currentTime = 2_510;
      media.fire("timeupdate");
    });
    const card = screen.getByRole("dialog", { name: "Next episode" });
    expect(within(card).getByText("E6 · Salt and Smoke")).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(10_000));
    expect(onNext).toHaveBeenCalledWith(next);
  });

  it("lets you cancel the next episode", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const { media } = renderPlayer(episode(1, 5), { next: episode(1, 6) as never, onNext });
    act(() => media.fire("ended"));

    await user.click(within(screen.getByRole("dialog", { name: "Next episode" })).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Next episode" })).not.toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });
});
