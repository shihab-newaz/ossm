import { http, HttpResponse } from "msw";

// Shared by the test server and (later) the browser mock used for `pnpm dev:mock`.
export const handlers = [
  http.get("*/api/v1/health", () => HttpResponse.json({ status: "UP", database: "UP" })),
];
