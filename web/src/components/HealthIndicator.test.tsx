import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { HealthIndicator } from "./HealthIndicator";

function renderIndicator() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HealthIndicator />
    </QueryClientProvider>,
  );
}

describe("HealthIndicator", () => {
  it("shows the API as healthy when the backend reports UP", async () => {
    renderIndicator();

    expect(await screen.findByText("API connected")).toBeInTheDocument();
  });

  it("shows the API as unreachable when the backend fails", async () => {
    server.use(http.get("*/api/v1/health", () => new HttpResponse(null, { status: 500 })));
    renderIndicator();

    expect(await screen.findByText("API unreachable")).toBeInTheDocument();
  });

  it("shows a degraded state when the database is down", async () => {
    server.use(http.get("*/api/v1/health", () => HttpResponse.json({ status: "UP", database: "DOWN" })));
    renderIndicator();

    expect(await screen.findByText("API up, database down")).toBeInTheDocument();
  });
});
