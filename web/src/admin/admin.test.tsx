import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcceptInviteForm } from "@/auth/AcceptInviteForm";
import { SettingsPage } from "@/auth/SettingsPage";
import { Providers } from "@/components/Providers";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { Sidebar } from "@/components/shell/Sidebar";
import { admin, problem } from "@/test/handlers";
import { resetNavigation, router } from "@/test/navigation";
import { server } from "@/test/server";
import { UsersAdmin } from "./UsersAdmin";
import type { UserSummary } from "./users";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationMock);

const member = { id: "11111111-1111-4111-8111-111111111111", username: "grace", role: "USER" as const };
const row = (u: { id: string; username: string; role: "ADMIN" | "USER" }, status: UserSummary["status"]): UserSummary => ({
  ...u,
  status,
  createdAt: "2026-10-02T10:00:00Z",
});

const signedInAs = (user: typeof admin | typeof member) => server.use(http.get("*/api/v1/auth/me", () => HttpResponse.json(user)));

/** A tiny in-memory user table behind the mock API, so list refreshes after a change. */
function userTable(initial: UserSummary[]) {
  const users = [...initial];
  const calls: string[] = [];
  server.use(
    http.get("*/api/v1/users", () => HttpResponse.json(users)),
    http.post("*/api/v1/users", async ({ request }) => {
      const body = (await request.json()) as { username: string; role: "ADMIN" | "USER" };
      calls.push(`create ${body.username} ${body.role}`);
      if (users.some((u) => u.username === body.username)) return problem(409, "Conflict", "That username is already taken.");
      const created = row({ id: crypto.randomUUID(), ...body }, "INVITED");
      users.push(created);
      return HttpResponse.json({ user: created, token: "tok_abc123", expiresAt: "2026-10-09T10:00:00Z" }, { status: 201 });
    }),
    http.post("*/api/v1/users/:id/deactivate", ({ params }) => {
      calls.push(`deactivate ${params.id}`);
      const user = users.find((u) => u.id === params.id)!;
      user.status = "DEACTIVATED";
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("*/api/v1/users/:id/activate", ({ params }) => {
      calls.push(`activate ${params.id}`);
      users.find((u) => u.id === params.id)!.status = "ACTIVE";
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("*/api/v1/users/:id/invite", () =>
      HttpResponse.json({ user: users.find((u) => u.status === "INVITED")!, token: "tok_fresh999", expiresAt: "2026-10-09T10:00:00Z" }),
    ),
  );
  return { users, calls };
}

beforeEach(resetNavigation);

describe("user list", () => {
  it("shows every user with role and status", async () => {
    signedInAs(admin);
    userTable([row(admin, "ACTIVE"), row(member, "ACTIVE"), row({ id: "2", username: "henry", role: "USER" }, "INVITED")]);
    render(<Providers><UsersAdmin /></Providers>);

    const grace = (await screen.findByRole("row", { name: /grace/ }));
    expect(within(grace).getByText("Active")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /henry/ })).getByText("Invited")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /ada/ })).getByText("you")).toBeInTheDocument();
  });

  it("offers no way to deactivate yourself", async () => {
    signedInAs(admin);
    userTable([row(admin, "ACTIVE")]);
    render(<Providers><UsersAdmin /></Providers>);

    await screen.findByRole("row", { name: /ada/ });
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
  });
});

describe("inviting", () => {
  it("creates an invite, shows the one-time link and lists the pending user", async () => {
    signedInAs(admin);
    const { calls } = userTable([row(admin, "ACTIVE")]);
    const user = userEvent.setup();
    render(<Providers><UsersAdmin /></Providers>);

    await user.type(await screen.findByLabelText("Username"), "henry");
    await user.selectOptions(screen.getByLabelText("Role"), "USER");
    await user.click(screen.getByRole("button", { name: "Create invite" }));

    const link = await screen.findByRole("textbox", { name: "Invite link" });
    expect(link).toHaveValue(`${window.location.origin}/invite/tok_abc123`);
    expect(calls).toContain("create henry USER");
    expect(await screen.findByRole("row", { name: /henry/ })).toHaveTextContent("Invited");
  });

  it("shows why an invite was refused", async () => {
    signedInAs(admin);
    userTable([row(admin, "ACTIVE"), row(member, "ACTIVE")]);
    const user = userEvent.setup();
    render(<Providers><UsersAdmin /></Providers>);

    await user.type(await screen.findByLabelText("Username"), "grace");
    await user.click(screen.getByRole("button", { name: "Create invite" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That username is already taken.");
  });

  it("makes a new link for a pending user", async () => {
    signedInAs(admin);
    userTable([row(admin, "ACTIVE"), row({ id: "2", username: "henry", role: "USER" }, "INVITED")]);
    const user = userEvent.setup();
    render(<Providers><UsersAdmin /></Providers>);

    await user.click(await screen.findByRole("button", { name: "New invite link" }));

    expect(await screen.findByRole("textbox", { name: "Invite link" })).toHaveValue(`${window.location.origin}/invite/tok_fresh999`);
  });
});

describe("deactivating", () => {
  it("asks first, then deactivates, and can restore access", async () => {
    signedInAs(admin);
    const { calls } = userTable([row(admin, "ACTIVE"), row(member, "ACTIVE")]);
    const user = userEvent.setup();
    render(<Providers><UsersAdmin /></Providers>);

    const grace = await screen.findByRole("row", { name: /grace/ });
    await user.click(within(grace).getByRole("button", { name: "Deactivate" }));
    expect(calls).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Confirm deactivate grace" }));

    await waitFor(() => expect(within(screen.getByRole("row", { name: /grace/ })).getByText("Deactivated")).toBeInTheDocument());
    expect(calls).toEqual([`deactivate ${member.id}`]);

    await user.click(within(screen.getByRole("row", { name: /grace/ })).getByRole("button", { name: "Reactivate" }));
    await waitFor(() => expect(within(screen.getByRole("row", { name: /grace/ })).getByText("Active")).toBeInTheDocument());
  });

  it("lets the person back out", async () => {
    signedInAs(admin);
    const { calls } = userTable([row(admin, "ACTIVE"), row(member, "ACTIVE")]);
    const user = userEvent.setup();
    render(<Providers><UsersAdmin /></Providers>);

    await user.click(within(await screen.findByRole("row", { name: /grace/ })).getByRole("button", { name: "Deactivate" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(calls).toEqual([]);
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
  });
});

describe("who sees admin features", () => {
  it("hides the admin page and navigation from regular users", async () => {
    signedInAs(member);
    const user = userEvent.setup();
    render(<Providers><Sidebar /><AccountMenu /><UsersAdmin /></Providers>);

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Admin" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Manage users" })).not.toBeInTheDocument();
  });

  it("shows admins the user links", async () => {
    signedInAs(admin);
    const user = userEvent.setup();
    render(<Providers><Sidebar /><AccountMenu /></Providers>);

    expect(await screen.findByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin/users");
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menuitem", { name: "Manage users" })).toBeInTheDocument();
  });
});

describe("changing your password", () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm = next) {
    await user.type(await screen.findByLabelText("Current password"), current);
    await user.type(screen.getByLabelText("New password"), next);
    await user.type(screen.getByLabelText("Confirm new password"), confirm);
  }

  it("sends both passwords and confirms", async () => {
    let sent: unknown;
    server.use(
      http.post("*/api/v1/auth/password", async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    render(<Providers><SettingsPage /></Providers>);

    await fill(user, "old password here", "a brand new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText(/Password changed/)).toBeInTheDocument();
    expect(sent).toEqual({ currentPassword: "old password here", newPassword: "a brand new password" });
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("shows the server's reason when the current password is wrong", async () => {
    server.use(http.post("*/api/v1/auth/password", () => problem(400, "Bad Request", "Current password is incorrect.")));
    const user = userEvent.setup();
    render(<Providers><SettingsPage /></Providers>);

    await fill(user, "wrong wrong wrong", "a brand new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect.");
  });

  it("will not submit when the confirmation differs", async () => {
    const user = userEvent.setup();
    render(<Providers><SettingsPage /></Providers>);

    await fill(user, "old password here", "a brand new password", "a different one");

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change password" })).toBeDisabled();
  });
});

describe("accepting an invite", () => {
  it("sets the password and enters the app", async () => {
    let sent: unknown;
    server.use(
      http.get("*/api/v1/invites/:token", () => HttpResponse.json({ username: "henry" })),
      http.post("*/api/v1/invites/tok_abc123/accept", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ ...member, username: "henry" }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    render(<Providers><AcceptInviteForm token="tok_abc123" /></Providers>);

    expect(await screen.findByRole("heading", { name: "Welcome, henry" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Password"), "my own long password");
    await user.type(screen.getByLabelText("Confirm password"), "my own long password");
    await user.click(screen.getByRole("button", { name: "Set password and continue" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(sent).toEqual({ password: "my own long password" });
  });

  it("explains a link that is used up or expired", async () => {
    server.use(http.get("*/api/v1/invites/:token", () => problem(404, "Not Found", "This invite link is not valid or has expired.")));
    render(<Providers><AcceptInviteForm token="old" /></Providers>);

    expect(await screen.findByRole("alert")).toHaveTextContent("not valid or has expired");
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });
});
