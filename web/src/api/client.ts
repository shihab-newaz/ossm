import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./schema";

// Same origin in every environment: Caddy routes /api to the backend, and the dev server proxies it.
export const api = createClient<paths>({
  baseUrl: typeof window === "undefined" ? (process.env.API_ORIGIN ?? "http://localhost:8080") : window.location.origin,
  // Resolve fetch per call so test and browser mocks that patch globalThis.fetch after import still apply.
  fetch: (request) => globalThis.fetch(request),
});

// A 401 anywhere except while logging in means the session ended. The app registers one handler that
// clears the cached user, which sends the person to the login screen.
const PUBLIC_PATHS = ["/api/v1/auth/login", "/api/v1/auth/me", "/api/v1/setup"];
let onUnauthorized: (() => void) | undefined;

export function setUnauthorizedHandler(handler: (() => void) | undefined) {
  onUnauthorized = handler;
}

const sessionEnded: Middleware = {
  onResponse({ response }) {
    const { pathname } = new URL(response.url);
    if (response.status === 401 && !PUBLIC_PATHS.includes(pathname)) onUnauthorized?.();
  },
};
api.use(sessionEnded);
