import { http, HttpResponse } from "msw";

export const admin = { id: "6f1c1c4e-3a55-4d1e-9a70-0c1d2b3a4e5f", username: "ada", role: "ADMIN" as const };

export const problem = (status: number, title: string, detail: string) =>
  HttpResponse.json({ type: "about:blank", title, status, detail }, { status, headers: { "Content-Type": "application/problem+json" } });

// Defaults describe a configured instance with nobody logged in. Tests override per scenario.
// Shared by the test server and (later) the browser mock used for `pnpm dev:mock`.
export const handlers = [
  http.get("*/api/v1/health", () => HttpResponse.json({ status: "UP", database: "UP" })),
  http.get("*/api/v1/setup", () => HttpResponse.json({ setupRequired: false })),
  http.get("*/api/v1/auth/me", () => problem(401, "Unauthorized", "You are not logged in.")),
];
