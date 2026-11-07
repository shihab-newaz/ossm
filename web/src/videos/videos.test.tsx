import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { Sidebar } from "@/components/shell/Sidebar";
import { TabBar } from "@/components/shell/TabBar";
import { problem } from "@/test/handlers";
import { resetNavigation } from "@/test/navigation";
import { server } from "@/test/server";
import { MAX_VIDEO_BYTES } from "@/upload/uploader";
import { VideosScreen } from "./VideosScreen";
import { formatBytes } from "./format";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);
beforeEach(resetNavigation);

const UPLOAD_ID = "5b0c1c2e-5a55-4d1e-9a70-0c1d2b3a4e5f";
const OWNER_ID = "6f1c1c4e-3a55-4d1e-9a70-0c1d2b3a4e5f";
const base = { id: UPLOAD_ID, filename: "beach.mp4", sizeBytes: 10, createdAt: "2026-11-07T10:00:00Z" };
// Same origin as the test page, like production where Caddy serves the bucket on the app's own origin.
const storeUrl = (part: number) => `${window.location.origin}/ossm/video/${OWNER_ID}/${UPLOAD_ID}/original.mp4?part=${part}`;
const storePut = `${window.location.origin}/ossm/video/:owner/:id/original.mp4`;

const clip = (name = "beach.mp4", bytes = 10) => new File([new Uint8Array(bytes)], name, { type: "video/mp4" });
const video = (n: number, extra: object = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  title: `Clip ${n}`,
  description: "",
  originalFilename: `clip-${n}.mp4`,
  container: "MP4",
  sizeBytes: 12_300_000,
  createdAt: "2026-11-07T10:00:00Z",
  ...extra,
});

/** A mock vault that starts empty and gains `added` once the upload is done. */
function mockVault(initial: object[] = []) {
  const state = { videos: initial, requests: [] as URL[] };
  server.use(
    http.get("*/api/v1/videos", ({ request }) => {
      state.requests.push(new URL(request.url));
      return HttpResponse.json({ items: state.videos });
    }),
  );
  return state;
}

/** A mock API and store for one video split into two 5-byte parts. */
function mockUpload(options: { statuses?: Array<"INGESTING" | "DONE" | "FAILED" | "DUPLICATE">; error?: string; holdSecondPart?: Promise<void>; onDone?: () => void } = {}) {
  const calls = { created: 0, createBody: undefined as unknown, parts: [] as number[], completed: undefined as unknown };
  const statuses: string[] = [...(options.statuses ?? ["INGESTING", "DONE"])];
  server.use(
    http.post("*/api/v1/uploads", async ({ request }) => {
      calls.created++;
      calls.createBody = await request.json();
      return HttpResponse.json(
        {
          upload: { ...base, status: "UPLOADING" },
          partSizeBytes: 5,
          parts: [
            { partNumber: 1, url: storeUrl(1) },
            { partNumber: 2, url: storeUrl(2) },
          ],
        },
        { status: 201 },
      );
    }),
    http.put(storePut, async ({ request }) => {
      const part = Number(new URL(request.url).searchParams.get("part"));
      calls.parts.push(part);
      if (part === 2) await options.holdSecondPart;
      return new HttpResponse(null, { status: 200, headers: { ETag: `"etag-${part}"`, "Access-Control-Expose-Headers": "ETag" } });
    }),
    http.post("*/api/v1/uploads/:id/complete", async ({ request }) => {
      calls.completed = await request.json();
      return HttpResponse.json({ ...base, status: "INGESTING" }, { status: 202 });
    }),
    http.get("*/api/v1/uploads/:id", () => {
      const status = statuses.length > 1 ? statuses.shift()! : statuses[0];
      if (status === "DONE") options.onDone?.();
      return HttpResponse.json({ ...base, status, ...(status === "DONE" ? { videoId: UPLOAD_ID } : {}), ...(status === "FAILED" ? { error: options.error } : {}) });
    }),
  );
  return calls;
}

const renderVideos = () =>
  render(
    <Providers>
      <VideosScreen />
    </Providers>,
  );

describe("the vault", () => {
  it("invites you to upload when the vault is empty", async () => {
    mockVault([]);
    renderVideos();

    expect(await screen.findByRole("heading", { name: "Your vault is empty" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload videos" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Your videos" })).not.toBeInTheDocument();
  });

  it("shows each video as a tile with its title, container and size", async () => {
    mockVault([video(1), video(2, { title: "Birthday", container: "WEBM", sizeBytes: 4_100_000_000 })]);
    renderVideos();

    const tiles = await within(await screen.findByRole("list", { name: "Your videos" })).findAllByRole("listitem");
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveTextContent("Clip 1");
    expect(tiles[0]).toHaveTextContent("MP4 · 12.3 MB");
    expect(tiles[1]).toHaveTextContent("Birthday");
    expect(tiles[1]).toHaveTextContent("WEBM · 4.1 GB");
    // A tile opens the watch page for that video.
    expect(within(tiles[0]).getByRole("link")).toHaveAttribute("href", "/watch/00000000-0000-4000-8000-000000000001");
    expect(screen.queryByRole("heading", { name: "Your vault is empty" })).not.toBeInTheDocument();
  });

  it("shows skeletons while loading", async () => {
    server.use(http.get("*/api/v1/videos", () => new Promise(() => {})));
    renderVideos();

    expect(await screen.findByRole("status", { name: "Loading your vault" })).toBeInTheDocument();
  });

  it("says so when the vault cannot be loaded, and tries again on request", async () => {
    server.use(http.get("*/api/v1/videos", () => problem(500, "Internal Server Error", "Something went wrong.")));
    const user = userEvent.setup();
    renderVideos();

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your videos.");

    mockVault([video(1)]);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Clip 1")).toBeInTheDocument();
  });

  it("loads the next page by cursor when asked", async () => {
    const requests: URL[] = [];
    server.use(
      http.get("*/api/v1/videos", ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        return url.searchParams.get("cursor") === "next-page"
          ? HttpResponse.json({ items: [video(2)] })
          : HttpResponse.json({ items: [video(1)], nextCursor: "next-page" });
      }),
    );
    const user = userEvent.setup();
    renderVideos();

    await screen.findByText("Clip 1");
    expect(screen.queryByText("Clip 2")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show more videos" }));

    expect(await screen.findByText("Clip 2")).toBeInTheDocument();
    expect(screen.getByText("Clip 1")).toBeInTheDocument();
    // The last page has no cursor, so there is nothing more to ask for.
    expect(screen.queryByRole("button", { name: "Show more videos" })).not.toBeInTheDocument();
    expect(requests.map((r) => r.searchParams.get("cursor"))).toEqual([null, "next-page"]);
  });
});

describe("uploading videos", () => {
  it("sends each part to storage with progress, then shows the video in the vault", async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const vault = mockVault([]);
    const calls = mockUpload({ holdSecondPart: hold, onDone: () => (vault.videos = [video(1, { id: UPLOAD_ID, title: "beach" })]) });
    const user = userEvent.setup();
    renderVideos();
    await screen.findByRole("heading", { name: "Your vault is empty" });

    await user.upload(screen.getByLabelText("Video files"), clip());

    // Part one is in storage, part two is still in flight: half way.
    const bar = await screen.findByRole("progressbar", { name: "Uploading beach.mp4" });
    await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "50"));

    release();
    expect(await screen.findByRole("status")).toHaveTextContent("Processing");
    expect(await screen.findByText(/Added to your vault/, undefined, { timeout: 5000 })).toBeInTheDocument();
    // The vault reloads by itself: the new video's tile appears, and the empty prompt is gone.
    const tiles = await screen.findByRole("list", { name: "Your videos" });
    expect(within(tiles).getByText("beach")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your vault is empty" })).not.toBeInTheDocument();

    expect(calls.parts).toEqual([1, 2]);
    expect(calls.createBody).toEqual({ filename: "beach.mp4", sizeBytes: 10, kind: "VIDEO" });
    expect(calls.completed).toEqual({
      parts: [
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 2, etag: '"etag-2"' },
      ],
    });
  });

  it("uploads several files one after another", async () => {
    mockVault([]);
    const calls = mockUpload({ statuses: ["DONE"] });
    const user = userEvent.setup();
    renderVideos();

    await user.upload(screen.getByLabelText("Video files"), [clip("a.mp4"), clip("b.mkv")]);

    await waitFor(() => expect(calls.created).toBe(2), { timeout: 5000 });
    const list = screen.getByRole("list", { name: "Uploads" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(await within(list).findAllByText(/Added to your vault/, undefined, { timeout: 5000 })).toHaveLength(2);
  });

  it("shows why an upload failed and offers a retry that works once the cause is gone", async () => {
    mockVault([]);
    mockUpload({ statuses: ["FAILED"], error: "This isn't a supported video file. MP4, M4V, MOV, WebM and MKV work." });
    let retried = 0;
    const user = userEvent.setup();
    renderVideos();
    await user.upload(screen.getByLabelText("Video files"), clip("holiday.mp4"));
    expect(await screen.findByRole("alert", undefined, { timeout: 5000 })).toHaveTextContent("isn't a supported video file");

    server.use(
      http.post("*/api/v1/uploads/:id/retry", () => {
        retried++;
        return HttpResponse.json({ ...base, status: "INGESTING" }, { status: 202 });
      }),
      http.get("*/api/v1/uploads/:id", () => HttpResponse.json({ ...base, status: "DONE", videoId: UPLOAD_ID })),
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText(/Added to your vault/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(retried).toBe(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("tells you a duplicate was skipped, and that it is not an error", async () => {
    mockVault([video(1)]);
    mockUpload({ statuses: ["DUPLICATE"] });
    const user = userEvent.setup();
    renderVideos();

    await user.upload(screen.getByLabelText("Video files"), clip());

    expect(await screen.findByText(/Already in your vault/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refuses a file over 20 GB, or an empty one, without contacting the server", async () => {
    mockVault([]);
    const calls = mockUpload();
    const huge = clip("huge.mkv");
    Object.defineProperty(huge, "size", { value: MAX_VIDEO_BYTES + 1 });
    const user = userEvent.setup();
    renderVideos();

    await user.upload(screen.getByLabelText("Video files"), [huge, clip("empty.mp4", 0)]);

    const alerts = await screen.findAllByRole("alert");
    expect(alerts[0]).toHaveTextContent("at most 20 GB");
    expect(alerts[1]).toHaveTextContent("empty");
    expect(calls.created).toBe(0);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("shows the server's reason when an upload cannot start", async () => {
    mockVault([]);
    server.use(http.post("*/api/v1/uploads", () => problem(400, "Invalid request", "Files can be at most 20 GB")));
    const user = userEvent.setup();
    renderVideos();

    await user.upload(screen.getByLabelText("Video files"), clip());

    expect(await screen.findByRole("alert")).toHaveTextContent("Files can be at most 20 GB");
  });
});

describe("navigation", () => {
  it("has a Videos entry in the sidebar and in the mobile tab bar", async () => {
    server.use(http.get("*/api/v1/auth/me", () => HttpResponse.json({ id: OWNER_ID, username: "ada", role: "USER" })));
    render(
      <Providers>
        <Sidebar />
        <TabBar />
      </Providers>,
    );

    const links = screen.getAllByRole("link", { name: "Videos" });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute("href", "/videos");
  });
});

describe("formatting sizes", () => {
  it("uses decimal units, like the size caps", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(4_096)).toBe("4 KB");
    expect(formatBytes(12_300_000)).toBe("12.3 MB");
    expect(formatBytes(20_000_000_000)).toBe("20.0 GB");
  });
});
