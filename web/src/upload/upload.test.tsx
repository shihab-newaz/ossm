import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { LibraryScreen } from "@/library/LibraryScreen";
import { Providers } from "@/components/Providers";
import { problem } from "@/test/handlers";
import { server } from "@/test/server";
import { UploadScreen } from "./UploadScreen";
import { MAX_BYTES } from "./uploader";

const UPLOAD_ID = "9d4c1c2e-5a55-4d1e-9a70-0c1d2b3a4e5f";
const base = { id: UPLOAD_ID, filename: "song.mp3", sizeBytes: 10, createdAt: "2026-10-02T10:00:00Z" };
// Same origin as the test page, like production where Caddy serves the bucket on the app's own origin.
const storeUrl = (part: number) => `${window.location.origin}/ossm/audio/${UPLOAD_ID}.mp3?part=${part}`;

const mp3 = (name = "song.mp3", bytes = 10) => new File([new Uint8Array(bytes)], name, { type: "audio/mpeg" });

/** A mock API and store for one upload split into two 5-byte parts. */
function mockUpload(options: { statuses?: Array<"INGESTING" | "DONE" | "FAILED">; error?: string; holdSecondPart?: Promise<void> } = {}) {
  const calls = { created: 0, parts: [] as number[], completed: undefined as unknown };
  const statuses = [...(options.statuses ?? ["INGESTING", "DONE"])];
  server.use(
    http.post("*/api/v1/uploads", async () => {
      calls.created++;
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

    await user.upload(screen.getByLabelText("Audio files"), mp3());

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

    await user.upload(screen.getByLabelText("Audio files"), mp3("notes.mp3"));

    expect(await screen.findByRole("alert", undefined, { timeout: 5000 })).toHaveTextContent("could not be read as audio");
  });

  it("refuses a file over 250 MB without contacting the server", async () => {
    const calls = mockUpload();
    const huge = mp3("huge.mp3");
    Object.defineProperty(huge, "size", { value: MAX_BYTES + 1 });
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Audio files"), huge);

    expect(await screen.findByRole("alert")).toHaveTextContent("at most 250 MB");
    expect(calls.created).toBe(0);
  });

  it("refuses an empty file", async () => {
    const calls = mockUpload();
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Audio files"), mp3("empty.mp3", 0));

    expect(await screen.findByRole("alert")).toHaveTextContent("empty");
    expect(calls.created).toBe(0);
  });

  it("shows the server's reason when an upload cannot start", async () => {
    server.use(http.post("*/api/v1/uploads", () => problem(400, "Invalid request", "Files can be at most 250 MB.")));
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Audio files"), mp3());

    expect(await screen.findByRole("alert")).toHaveTextContent("Files can be at most 250 MB.");
  });

  it("reports a storage failure instead of hanging", async () => {
    mockUpload();
    server.use(http.put(`${window.location.origin}/ossm/audio/:key`, () => new HttpResponse(null, { status: 403 })));
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Audio files"), mp3());

    expect(await screen.findByRole("alert")).toHaveTextContent("storage server refused");
  });

  it("handles several files in one go, one after another", async () => {
    const calls = mockUpload({ statuses: ["DONE"] });
    const user = userEvent.setup();
    renderUpload();

    await user.upload(screen.getByLabelText("Audio files"), [mp3("a.mp3"), mp3("b.mp3")]);

    await waitFor(() => expect(calls.created).toBe(2), { timeout: 5000 });
    const list = screen.getByRole("list", { name: "Uploads" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(await within(list).findAllByText(/Added to your library/, undefined, { timeout: 5000 })).toHaveLength(2);
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
