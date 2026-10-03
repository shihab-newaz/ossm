import { useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { Providers } from "@/components/Providers";
import { player } from "@/player/player";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { admin, problem } from "@/test/handlers";
import { location, resetNavigation, router } from "@/test/navigation";
import { server } from "@/test/server";
import { AuthGate } from "./AuthGate";
import { LoginForm } from "./LoginForm";
import { SetupForm } from "./SetupForm";
import { safeNext } from "./session";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

const signedIn = () => server.use(http.get("*/api/v1/auth/me", () => HttpResponse.json(admin)));
const freshInstance = () => server.use(http.get("*/api/v1/setup", () => HttpResponse.json({ setupRequired: true })));

beforeEach(resetNavigation);

describe("first-run setup", () => {
  it("creates the admin and enters the app", async () => {
    freshInstance();
    let sent: unknown;
    server.use(
      http.post("*/api/v1/setup", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(admin, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    render(<Providers><SetupForm /></Providers>);

    await user.type(await screen.findByLabelText("Username"), "ada");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.type(screen.getByLabelText("Confirm password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Create admin account" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(sent).toEqual({ username: "ada", password: "correct horse battery" });
  });

  it("will not submit mismatched passwords", async () => {
    freshInstance();
    const user = userEvent.setup();
    render(<Providers><SetupForm /></Providers>);

    await user.type(await screen.findByLabelText("Username"), "ada");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.type(screen.getByLabelText("Confirm password"), "something else");

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create admin account" })).toBeDisabled();
  });

  it("shows the server's reason when the password is rejected", async () => {
    freshInstance();
    server.use(http.post("*/api/v1/setup", () => problem(400, "Invalid request", "Password must be 12 to 128 characters")));
    const user = userEvent.setup();
    render(<Providers><SetupForm /></Providers>);

    await user.type(await screen.findByLabelText("Username"), "ada");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.type(screen.getByLabelText("Confirm password"), "short");
    await user.click(screen.getByRole("button", { name: "Create admin account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Password must be 12 to 128 characters");
  });

  it("is gone once an admin exists", async () => {
    render(<Providers><SetupForm /></Providers>);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
  });
});

describe("login", () => {
  it("logs in and returns to the page that was wanted", async () => {
    location.search = "?next=%2Flibrary%3Ftab%3Dalbums";
    server.use(http.post("*/api/v1/auth/login", () => HttpResponse.json(admin)));
    const user = userEvent.setup();
    render(<Providers><LoginForm /></Providers>);

    await user.type(await screen.findByLabelText("Username"), "ada");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/library?tab=albums"));
  });

  it("says the credentials were wrong without saying which one", async () => {
    server.use(http.post("*/api/v1/auth/login", () => problem(401, "Unauthorized", "Incorrect username or password.")));
    const user = userEvent.setup();
    render(<Providers><LoginForm /></Providers>);

    await user.type(await screen.findByLabelText("Username"), "ada");
    await user.type(screen.getByLabelText("Password"), "wrong password!");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect username or password.");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("sends a brand-new instance to setup instead", async () => {
    freshInstance();
    render(<Providers><LoginForm /></Providers>);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/setup"));
  });

  it("never redirects to another site after login", () => {
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("/login")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("/playlists/12")).toBe("/playlists/12");
  });
});

describe("the auth gate", () => {
  it("shows the app to a signed-in user", async () => {
    signedIn();
    render(<Providers><AuthGate><p>secret library</p></AuthGate></Providers>);

    expect(await screen.findByText("secret library")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to login and remembers the page", async () => {
    location.pathname = "/library";
    window.history.replaceState({}, "", "/library?tab=albums");
    render(<Providers><AuthGate><p>secret library</p></AuthGate></Providers>);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login?next=%2Flibrary%3Ftab%3Dalbums"));
    expect(screen.queryByText("secret library")).not.toBeInTheDocument();
  });

  it("sends a visitor to setup when the instance has no admin yet", async () => {
    freshInstance();
    render(<Providers><AuthGate><p>secret library</p></AuthGate></Providers>);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/setup"));
  });

  it("sends the user to login when the session expires mid-use", async () => {
    signedIn();
    location.pathname = "/playlists";
    window.history.replaceState({}, "", "/playlists");
    function Page() {
      const { data } = useQuery({
        queryKey: ["library"],
        queryFn: async () => (await api.GET("/api/v1/health")).data ?? null,
        refetchInterval: 50,
      });
      return <p>{data ? "library loaded" : "waiting"}</p>;
    }
    render(<Providers><AuthGate><Page /></AuthGate></Providers>);
    expect(await screen.findByText("library loaded")).toBeInTheDocument();

    // The server forgets the session; the next request comes back 401.
    server.use(http.get("*/api/v1/health", () => problem(401, "Unauthorized", "You are not logged in.")));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login?next=%2Fplaylists"));
  });
});

describe("playback and signing out", () => {
  it("leaves the music alone while signed in, and stops it and empties the queue once the session is gone", async () => {
    signedIn();
    const stop = vi.spyOn(player, "stop").mockImplementation(() => {});
    function Page() {
      const { data } = useQuery({
        queryKey: ["library"],
        queryFn: async () => (await api.GET("/api/v1/health")).data ?? null,
        refetchInterval: 50,
      });
      return <p>{data ? "library loaded" : "waiting"}</p>;
    }
    render(<Providers><AuthGate><Page /></AuthGate></Providers>);
    expect(await screen.findByText("library loaded")).toBeInTheDocument();
    expect(stop).not.toHaveBeenCalled();

    server.use(http.get("*/api/v1/health", () => problem(401, "Unauthorized", "You are not logged in.")));

    await waitFor(() => expect(stop).toHaveBeenCalled());
    stop.mockRestore();
  });

  it("stops it for a visitor who was never signed in, so a stale queue is not kept", async () => {
    const stop = vi.spyOn(player, "stop").mockImplementation(() => {});
    render(<Providers><AuthGate><p>secret library</p></AuthGate></Providers>);

    await waitFor(() => expect(stop).toHaveBeenCalled());
    stop.mockRestore();
  });
});

describe("account menu", () => {
  it("logs out on the server and sends the user to a plain login", async () => {
    signedIn();
    let loggedOut = false;
    server.use(
      http.post("*/api/v1/auth/logout", () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    location.pathname = "/library";
    const user = userEvent.setup();
    render(<Providers><AuthGate><AccountMenu /></AuthGate></Providers>);

    await user.click(await screen.findByRole("button", { name: "Account menu" }));
    expect(screen.getByText("ada")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Log out" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(loggedOut).toBe(true);
  });

  it("closes on Escape", async () => {
    signedIn();
    const user = userEvent.setup();
    render(<Providers><AccountMenu /></Providers>);

    await user.click(await screen.findByRole("button", { name: "Account menu" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
