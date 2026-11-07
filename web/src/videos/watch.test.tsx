import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { isActive } from "@/components/shell/nav";
import { player } from "@/player/player";
import { problem } from "@/test/handlers";
import { resetNavigation } from "@/test/navigation";
import { server } from "@/test/server";
import { WatchScreen } from "./WatchScreen";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);
beforeEach(resetNavigation);
afterEach(() => vi.restoreAllMocks());

const ID = "5b0c1c2e-5a55-4d1e-9a70-0c1d2b3a4e5f";
const video = {
  id: ID,
  title: "Birthday Party",
  description: "Grandma's 80th, at the lake.\nBring a jacket.",
  originalFilename: "VID_20240611_183012.mp4",
  container: "MP4",
  sizeBytes: 4_100_000_000,
  createdAt: "2026-11-07T10:00:00Z",
};

const renderWatch = () =>
  render(
    <Providers>
      <WatchScreen id={ID} />
    </Providers>,
  );

describe("the watch page", () => {
  it("shows the player and the video's details", async () => {
    server.use(http.get(`*/api/v1/videos/${ID}`, () => HttpResponse.json(video)));
    renderWatch();

    expect(await screen.findByRole("heading", { level: 1, name: "Birthday Party" })).toBeInTheDocument();
    const player = screen.getByTestId("video-player");
    expect(player).toHaveAttribute("src", `/api/v1/videos/${ID}/stream`);
    // Native controls: play/pause, seek, volume, fullscreen and picture-in-picture come with them.
    expect(player).toHaveAttribute("controls");
    expect(screen.getByText(/Uploaded November \d+, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/4\.1 GB/)).toBeInTheDocument();
    expect(screen.getByText(/Grandma's 80th, at the lake\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Videos" })).toHaveAttribute("href", "/videos");
  });

  it("offers a Download original link to the original file", async () => {
    server.use(http.get(`*/api/v1/videos/${ID}`, () => HttpResponse.json(video)));
    renderWatch();

    const link = await screen.findByRole("link", { name: "Download original" });

    expect(link).toHaveAttribute("href", `/api/v1/videos/${ID}/download`);
    expect(link).toHaveAttribute("download");
  });

  it("leaves out the description when there is none", async () => {
    server.use(http.get(`*/api/v1/videos/${ID}`, () => HttpResponse.json({ ...video, description: "" })));
    renderWatch();

    await screen.findByRole("heading", { level: 1, name: "Birthday Party" });

    expect(screen.queryByText(/Grandma/)).not.toBeInTheDocument();
  });

  it("replaces the player with a can't-play panel, and keeps the download, when the browser cannot decode the file", async () => {
    server.use(http.get(`*/api/v1/videos/${ID}`, () => HttpResponse.json({ ...video, container: "MKV" })));
    renderWatch();
    const element = await screen.findByTestId("video-player");

    fireEvent.error(element);

    expect(await screen.findByRole("alert")).toHaveTextContent("This browser can't play this file");
    expect(screen.queryByTestId("video-player")).not.toBeInTheDocument();
    const downloads = screen.getAllByRole("link", { name: "Download original" });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toHaveAttribute("href", `/api/v1/videos/${ID}/download`);
    // The details are still there.
    expect(screen.getByRole("heading", { level: 1, name: "Birthday Party" })).toBeInTheDocument();
  });

  it("pauses the music when the video starts", async () => {
    const pause = vi.spyOn(player, "pause").mockImplementation(() => {});
    server.use(http.get(`*/api/v1/videos/${ID}`, () => HttpResponse.json(video)));
    renderWatch();
    const element = await screen.findByTestId("video-player");
    expect(pause).not.toHaveBeenCalled();

    fireEvent.play(element);

    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("says a video was not found without saying why", async () => {
    server.use(http.get(`*/api/v1/videos/${ID}`, () => problem(404, "Not Found", "No such video.")));
    renderWatch();

    expect(await screen.findByRole("heading", { name: "Video not found" })).toBeInTheDocument();
    expect(screen.queryByTestId("video-player")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download original" })).not.toBeInTheDocument();
  });

  it("shows skeletons while loading", async () => {
    server.use(http.get(`*/api/v1/videos/${ID}`, () => new Promise(() => {})));
    renderWatch();

    expect(await screen.findByRole("status", { name: "Loading this video" })).toBeInTheDocument();
  });

  it("offers another try when the video cannot be loaded", async () => {
    server.use(http.get(`*/api/v1/videos/${ID}`, () => problem(500, "Internal Server Error", "Oops.")));
    renderWatch();

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this video.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("navigation", () => {
  it("keeps Videos highlighted while watching a video", () => {
    expect(isActive(`/watch/${ID}`, "/videos")).toBe(true);
    expect(isActive("/videos", "/videos")).toBe(true);
    expect(isActive(`/watch/${ID}`, "/library")).toBe(false);
  });
});
