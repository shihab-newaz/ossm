import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { LibraryScreen } from "@/library/LibraryScreen";
import { Providers } from "@/components/Providers";
import { problem } from "@/test/handlers";
import { server } from "@/test/server";
import { UploadScreen } from "./UploadScreen";
import { MAX_BYTES } from "./uploader";

// jsdom's FormData and File cannot be sent by Node's fetch, so the multipart subtitle request is
// stood in for here. Everything else in this file goes through the real client and MSW.
const subtitleUploads = vi.hoisted(() => [] as string[]);
vi.mock("./uploader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./uploader")>()),
  uploadSubtitle: async (videoId: string, file: File) => {
    subtitleUploads.push(`${videoId}:${file.name}`);
    return { index: 0, language: "en", label: "English", url: "/x" };
  },
}));

const UPLOAD_ID = "9d4c1c2e-5a55-4d1e-9a70-0c1d2b3a4e5f";
const base = { id: UPLOAD_ID, filename: "song.mp3", sizeBytes: 10, createdAt: "2026-10-02T10:00:00Z" };
// Same origin as the test page, like production where Caddy serves the bucket on the app's own origin.
const storeUrl = (part: number) => `${window.location.origin}/ossm/audio/${UPLOAD_ID}.mp3?part=${part}`;

const mp3 = (name = "song.mp3", bytes = 10) => new File([new Uint8Array(bytes)], name, { type: "audio/mpeg" });

/** A mock API and store for one upload split into two 5-byte parts. */
function mockUpload(options: { statuses?: Array<"INGESTING" | "DONE" | "FAILED" | "DUPLICATE">; error?: string; holdSecondPart?: Promise<void> } = {}) {
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
    http.put(`${window.location.origin}/ossm/audio/:key`, async ({ request }) => {
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
      return HttpResponse.json({ ...base, status, ...(status === "DONE" ? { trackId: "t1" } : {}), ...(status === "FAILED" ? { error: options.error } : {}) });
    }),
  );
  return calls;
}

const renderUpload = () => render(<Providers><UploadScreen /></Providers>);

describe("uploading", () => {
  it("sends each part to storage, reports progress, then follows ingest to done", async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const calls = mockUpload({ holdSecondPart: hold });
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Music or video files"), mp3());

    // Part one is in storage, part two is still in flight: half way.
    const bar = await screen.findByRole("progressbar", { name: "Uploading song.mp3" });
    await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "50"));

    release();
    // The server is still working on it: an "ingesting" state, with no manual refresh.
    expect(await screen.findByRole("status")).toHaveTextContent("Processing");
    expect(await screen.findByText(/Added to your library/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View library" })).toHaveAttribute("href", "/library");

    expect(calls.parts).toEqual([1, 2]);
    expect(calls.completed).toEqual({
      parts: [
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 2, etag: '"etag-2"' },
      ],
    });
  });

  it("shows why ingest failed", async () => {
    mockUpload({ statuses: ["FAILED"], error: "This file could not be read as audio." });
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Music or video files"), mp3("notes.mp3"));

    expect(await screen.findByRole("alert", undefined, { timeout: 5000 })).toHaveTextContent("could not be read as audio");
  });

  it("refuses a file over 250 MB without contacting the server", async () => {
    const calls = mockUpload();
    const huge = mp3("huge.mp3");
    Object.defineProperty(huge, "size", { value: MAX_BYTES + 1 });
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Music or video files"), huge);

    expect(await screen.findByRole("alert")).toHaveTextContent("at most 250 MB");
    expect(calls.created).toBe(0);
  });

  it("refuses an empty file", async () => {
    const calls = mockUpload();
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Music or video files"), mp3("empty.mp3", 0));

    expect(await screen.findByRole("alert")).toHaveTextContent("empty");
    expect(calls.created).toBe(0);
  });

  it("shows the server's reason when an upload cannot start", async () => {
    server.use(http.post("*/api/v1/uploads", () => problem(400, "Invalid request", "Files can be at most 250 MB.")));
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Music or video files"), mp3());

    expect(await screen.findByRole("alert")).toHaveTextContent("Files can be at most 250 MB.");
  });

  it("reports a storage failure instead of hanging", async () => {
    mockUpload();
    server.use(http.put(`${window.location.origin}/ossm/audio/:key`, () => new HttpResponse(null, { status: 403 })));
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Music or video files"), mp3());

    expect(await screen.findByRole("alert")).toHaveTextContent("storage server refused");
  });

  it("handles several files in one go, one after another", async () => {
    const calls = mockUpload({ statuses: ["DONE"] });
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Music or video files"), [mp3("a.mp3"), mp3("b.mp3")]);

    await waitFor(() => expect(calls.created).toBe(2), { timeout: 5000 });
    const list = screen.getByRole("list", { name: "Uploads" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(await within(list).findAllByText(/Added to your library/, undefined, { timeout: 5000 })).toHaveLength(2);
  });
});

describe("license, duplicates and retry", () => {
  it("sends the default license, or the one chosen before adding files", async () => {
    const calls = mockUpload({ statuses: ["DONE"] });
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Music or video files"), mp3("first.mp3"));
    await waitFor(() => expect(calls.created).toBe(1), { timeout: 5000 });
    expect(calls.createBody).toMatchObject({ filename: "first.mp3", license: "All rights reserved" });

    await user.selectOptions(screen.getByLabelText("License"), "CC BY");
    await user.upload(screen.getByLabelText("Music or video files"), mp3("second.mp3"));
    await waitFor(() => expect(calls.created).toBe(2), { timeout: 5000 });
    expect(calls.createBody).toMatchObject({ filename: "second.mp3", license: "CC BY" });
  });

  it("tells the user a duplicate was skipped, and that it is not an error", async () => {
    mockUpload({ statuses: ["DUPLICATE"] });
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Music or video files"), mp3());

    expect(await screen.findByText(/Already in your library/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers a retry for a failed ingest that works once the cause is fixed", async () => {
    mockUpload({ statuses: ["FAILED"], error: "The uploaded file could not be found in storage." });
    let retried = 0;
    const user = userEvent.setup();
    renderUpload();
    await user.upload(screen.getByLabelText("Music or video files"), mp3());
    expect(await screen.findByRole("alert", undefined, { timeout: 5000 })).toHaveTextContent("could not be found in storage");

    // The cause is fixed server-side: after a retry the job runs and finishes.
    server.use(
      http.post("*/api/v1/uploads/:id/retry", () => {
        retried++;
        return HttpResponse.json({ ...base, status: "INGESTING" }, { status: 202 });
      }),
      http.get("*/api/v1/uploads/:id", () => HttpResponse.json({ ...base, status: "DONE", trackId: "t1" })),
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText(/Added to your library/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(retried).toBe(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows why a retry was refused", async () => {
    mockUpload({ statuses: ["FAILED"], error: "This isn't a supported audio file." });
    server.use(http.post("*/api/v1/uploads/:id/retry", () => problem(409, "Conflict", "Only failed uploads can be retried.")));
    const user = userEvent.setup();
    renderUpload();
    await user.upload(screen.getByLabelText("Music or video files"), mp3());
    await screen.findByRole("button", { name: "Retry" }, { timeout: 5000 });

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Only failed uploads can be retried.")).toBeInTheDocument();
  });

  it("does not offer a retry for a file the browser already refused", async () => {
    mockUpload();
    const huge = mp3("huge.mp3");
    Object.defineProperty(huge, "size", { value: MAX_BYTES + 1 });
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Music or video files"), huge);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});

describe("the library list", () => {
  const track = {
    id: "t1",
    title: "Midnight City",
    artist: "M83",
    album: "Hurry Up, We're Dreaming",
    albumId: "a1",
    coverUrl: "/api/v1/albums/a1/cover",
    durationMs: 243_000,
    createdAt: "2026-10-02T10:00:00Z",
  };

  it("shows tracks with artist, album, duration and cover", async () => {
    server.use(http.get("*/api/v1/tracks", () => HttpResponse.json([track, { ...track, id: "t2", title: "No Cover", album: undefined, coverUrl: undefined, durationMs: 61_000 }])));
    render(<Providers><LibraryScreen /></Providers>);

    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Midnight City");
    expect(rows[0]).toHaveTextContent("M83 · Hurry Up, We're Dreaming");
    expect(rows[0]).toHaveTextContent("4:03");
    expect(rows[0].querySelector("img")).toHaveAttribute("src", "/api/v1/albums/a1/cover");
    expect(rows[1]).toHaveTextContent("1:01");
    expect(rows[1].querySelector("img")).toBeNull();
  });

  it("shows skeletons while loading", async () => {
    server.use(http.get("*/api/v1/tracks", async () => new Promise(() => {})));
    render(<Providers><LibraryScreen /></Providers>);

    expect(await screen.findByRole("status", { name: "Loading your library" })).toBeInTheDocument();
  });

  it("guides an empty library to the upload screen", async () => {
    server.use(http.get("*/api/v1/tracks", () => HttpResponse.json([])));
    render(<Providers><LibraryScreen /></Providers>);

    expect(await screen.findByRole("heading", { name: "Your library is empty" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload music" })).toHaveAttribute("href", "/upload");
  });
});

describe("videos and folders", () => {
  const VIDEO_ID = "5b1c1c2e-5a55-4d1e-9a70-0c1d2b3a4e5f";
  const mp4 = (name = "Sintel (2010).mp4", bytes = 15) => new File([new Uint8Array(bytes)], name, { type: "video/mp4" });

  /** A video split into three 5-byte parts, of which the ticket carries only the first. */
  function mockVideo() {
    const calls = { pagesAskedFrom: [] as number[], parts: [] as number[] };
    const videoBase = { ...base, filename: "Sintel (2010).mp4", sizeBytes: 15, kind: "VIDEO" };
    server.use(
      http.post("*/api/v1/uploads", () =>
        HttpResponse.json({ upload: { ...videoBase, status: "UPLOADING" }, partSizeBytes: 5, partCount: 3, parts: [{ partNumber: 1, url: storeUrl(1) }] }, { status: 201 }),
      ),
      http.get("*/api/v1/uploads/:id/parts", ({ request }) => {
        const from = Number(new URL(request.url).searchParams.get("from"));
        calls.pagesAskedFrom.push(from);
        return HttpResponse.json([
          { partNumber: 2, url: storeUrl(2) },
          { partNumber: 3, url: storeUrl(3) },
        ]);
      }),
      http.put(`${window.location.origin}/ossm/audio/:key`, ({ request }) => {
        const part = Number(new URL(request.url).searchParams.get("part"));
        calls.parts.push(part);
        return new HttpResponse(null, { status: 200, headers: { ETag: `"etag-${part}"` } });
      }),
      http.post("*/api/v1/uploads/:id/complete", () => HttpResponse.json({ ...videoBase, status: "INGESTING" }, { status: 202 })),
      http.get("*/api/v1/uploads/:id", () => HttpResponse.json({ ...videoBase, status: "DONE", videoId: VIDEO_ID })),
    );
    return calls;
  }

  it("uploads a video, asking for the rest of its part URLs, and links to the watch page", async () => {
    const calls = mockVideo();
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Music or video files"), mp4());

    expect(await screen.findByText(/Added to your videos/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(calls.pagesAskedFrom).toEqual([2]);
    expect(calls.parts).toEqual([1, 2, 3]);
    expect(screen.getByRole("link", { name: "Watch" })).toHaveAttribute("href", `/watch/${VIDEO_ID}`);
  });

  it("attaches subtitle files to the video with the same name once it is in", async () => {
    mockVideo();
    const user = userEvent.setup();
    renderUpload();

    const srt = new File(["1\n00:00:01,000 --> 00:00:02,000\nHi\n"], "Sintel (2010).en.srt", { type: "application/x-subrip" });
    await user.upload(screen.getByLabelText("Music or video files"), [mp4(), srt]);

    expect(await screen.findByText("English subtitles added", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(subtitleUploads).toEqual([`${VIDEO_ID}:Sintel (2010).en.srt`]);
  });

  it("says when a subtitle file has no video to go with", async () => {
    mockVideo();
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Music or video files"), new File(["x"], "Other.srt"));

    expect(await screen.findByRole("alert")).toHaveTextContent("No video with this name");
  });

  it("refuses a video over 20 GB without contacting the server, and keeps 250 MB for music", async () => {
    const { rejectionReason } = await import("./uploader");
    expect(rejectionReason({ name: "film.mkv", size: 21 * 1024 ** 3 })).toBe("Videos can be at most 20 GB.");
    expect(rejectionReason({ name: "film.mkv", size: 300 * 1024 ** 2 })).toBeNull();
    expect(rejectionReason({ name: "song.flac", size: 300 * 1024 ** 2 })).toBe("Files can be at most 250 MB.");
  });

  it("skips files that are not music, video or subtitles, and says so", async () => {
    mockVideo();
    const user = userEvent.setup({ applyAccept: false });
    renderUpload();

    await user.upload(screen.getByLabelText("A folder of music or videos"), [mp4(), new File(["x"], "cover.jpg"), new File(["x"], "info.nfo"), new File(["x"], ".DS_Store")]);

    expect(await screen.findByRole("note")).toHaveTextContent("Skipped 2 files that aren't music, video or subtitles (cover.jpg, info.nfo)");
    expect(within(screen.getByRole("list", { name: "Uploads" })).getAllByRole("listitem")).toHaveLength(1);
  });
});

describe("upload helpers", () => {
  it("matches subtitle files to videos by name", async () => {
    const { subtitleStem, videoStem } = await import("./uploader");
    expect(subtitleStem("Sintel.2010.4K.en.srt")).toBe(videoStem("Sintel.2010.4K.mp4"));
    expect(subtitleStem("Sintel.2010.4K.eng.forced.srt")).toBe("sintel.2010.4k");
    expect(subtitleStem("Night Kitchen S02E05.vtt")).toBe(videoStem("Night Kitchen S02E05.mkv"));
  });

  it("formats sizes and time left", async () => {
    const { formatBytes, timeLeft } = await import("./uploader");
    expect(formatBytes(3.2 * 1024 ** 3)).toBe("3.2 GB");
    expect(formatBytes(48.2 * 1024 ** 2)).toBe("48.2 MB");
    expect(timeLeft(360 * 1024 ** 2, 1024 ** 2)).toBe("about 6 min left");
    expect(timeLeft(10, 100)).toBe("less than a minute left");
  });
});
