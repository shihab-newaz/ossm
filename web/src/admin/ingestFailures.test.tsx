import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { admin } from "@/test/handlers";
import { server } from "@/test/server";
import { IngestFailures } from "./IngestFailures";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

const member = { id: "11111111-1111-4111-8111-111111111111", username: "grace", role: "USER" as const };
const signedInAs = (user: typeof admin | typeof member) => server.use(http.get("*/api/v1/auth/me", () => HttpResponse.json(user)));

describe("failed uploads (admin)", () => {
  it("lists each failure with who uploaded it and why it failed", async () => {
    signedInAs(admin);
    server.use(
      http.get("*/api/v1/admin/ingest-failures", () =>
        HttpResponse.json([
          { uploadId: "u1", filename: "notes.mp3", error: "This isn't a supported audio file.", username: "grace", failedAt: "2026-10-03T10:00:00Z" },
          { uploadId: "u2", filename: "clip.flac", error: "We couldn't process this file because of a temporary problem.", username: "henry", failedAt: "2026-10-03T09:00:00Z" },
        ]),
      ),
    );
    render(<Providers><IngestFailures /></Providers>);

    const first = await screen.findByRole("row", { name: /notes\.mp3/ });
    expect(within(first).getByText("grace")).toBeInTheDocument();
    expect(within(first).getByText("This isn't a supported audio file.")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /clip\.flac/ })).toHaveTextContent("henry");
  });

  it("says so when nothing has failed", async () => {
    signedInAs(admin);
    server.use(http.get("*/api/v1/admin/ingest-failures", () => HttpResponse.json([])));
    render(<Providers><IngestFailures /></Providers>);

    expect(await screen.findByText(/No failed uploads/)).toBeInTheDocument();
  });

  it("does not exist for regular users", async () => {
    signedInAs(member);
    render(<Providers><IngestFailures /></Providers>);

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});
