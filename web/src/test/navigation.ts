import { vi } from "vitest";

// Stand-in for next/navigation. Tests install it with:
//   vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);
export const router = { replace: vi.fn(), push: vi.fn() };
export const location = { pathname: "/", search: "" };

export const navigationMock = {
  useRouter: () => router,
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
};

export function resetNavigation() {
  router.replace.mockClear();
  router.push.mockClear();
  location.pathname = "/";
  location.search = "";
  window.history.replaceState({}, "", "/");
}
