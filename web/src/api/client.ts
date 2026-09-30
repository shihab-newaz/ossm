import createClient from "openapi-fetch";
import type { paths } from "./schema";

// Same origin in every environment: Caddy routes /api to the backend, and the dev server proxies it.
export const api = createClient<paths>({
  baseUrl: typeof window === "undefined" ? (process.env.API_ORIGIN ?? "http://localhost:8080") : window.location.origin,
  // Resolve fetch per call so test and browser mocks that patch globalThis.fetch after import still apply.
  fetch: (request) => globalThis.fetch(request),
});
