"use client";

import { useState, type FormEvent } from "react";
import { Field, FormError, PrimaryButton } from "@/components/ui/form";
import { AdminGate } from "./AdminGate";
import { useCreateUser, useReissueInvite, useSetActive, useUsers, type InviteCreated, type UserSummary } from "./users";

const STATUS_LABEL = { ACTIVE: "Active", INVITED: "Invited", DEACTIVATED: "Deactivated" } as const;

export function UsersAdmin() {
  return <AdminGate>{(adminId) => <Users adminId={adminId} />}</AdminGate>;
}

function Users({ adminId }: { adminId: string }) {
  const users = useUsers();
  const [invite, setInvite] = useState<InviteCreated | null>(null);

  return (
    <div className="flex flex-col gap-8 py-8">
      <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">Users</h1>
      <InviteForm onInvited={setInvite} />
      {invite ? <InviteLink invite={invite} onDismiss={() => setInvite(null)} /> : null}
      {users.isError ? <FormError>Could not load users.</FormError> : null}
      {users.data ? <UserList users={users.data} selfId={adminId} onInvite={setInvite} /> : <p className="text-fg-subtle">Loading…</p>}
    </div>
  );
}

function InviteForm({ onInvited }: { onInvited: (invite: InviteCreated) => void }) {
  const create = useCreateUser();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate(
      { username: username.trim(), role },
      {
        onSuccess: (invite) => {
          onInvited(invite);
          setUsername("");
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4 rounded-card bg-bg-subtle p-4" noValidate>
      <h2 className="font-display text-xl font-bold">Invite someone</h2>
      <p className="text-[14px] text-fg-muted">You get a link to send them. They choose their own password, so you never see it.</p>
      {create.isError ? <FormError>{create.error.message}</FormError> : null}
      <Field
        id="invite-username"
        label="Username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="invite-role" className="text-[13px] font-semibold">
          Role
        </label>
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value as "USER" | "ADMIN")}
          className="h-11 rounded-card border border-border-strong bg-surface px-3 text-[15px]"
        >
          <option value="USER">User</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <PrimaryButton type="submit" disabled={create.isPending || !username.trim()}>
        {create.isPending ? "Creating…" : "Create invite"}
      </PrimaryButton>
    </form>
  );
}

function InviteLink({ invite, onDismiss }: { invite: InviteCreated; onDismiss: () => void }) {
  const link = `${window.location.origin}/invite/${invite.token}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the link is selectable in the field.
    }
  }

  return (
    <section aria-label="Invite link" className="flex max-w-xl flex-col gap-3 rounded-card border border-border-strong p-4">
      <h2 className="font-display text-xl font-bold">Invite link for {invite.user.username}</h2>
      <p className="text-[14px] text-fg-muted">
        Send this link to them. It works once and expires on {new Date(invite.expiresAt).toLocaleDateString()}. It is not shown again, but you can make a
        new one from the list.
      </p>
      <input
        readOnly
        aria-label="Invite link"
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="h-11 w-full rounded-card border border-border-strong bg-surface px-3 font-mono text-[12px]"
      />
      <div className="flex gap-2">
        <button onClick={copy} className="h-10 rounded-full border border-border-strong px-4 text-[14px] font-semibold hover:bg-surface-hover">
          {copied ? "Copied" : "Copy link"}
        </button>
        <button onClick={onDismiss} className="h-10 rounded-full px-4 text-[14px] text-fg-muted hover:bg-surface-hover">
          Done
        </button>
      </div>
    </section>
  );
}

function UserList({ users, selfId, onInvite }: { users: UserSummary[]; selfId?: string; onInvite: (invite: InviteCreated) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[15px]">
        <caption className="sr-only">Users</caption>
        <thead className="text-[12px] uppercase tracking-[0.06em] text-fg-subtle">
          <tr>
            <th scope="col" className="py-2 pr-4 font-semibold">User</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Role</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
            <th scope="col" className="py-2 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow key={user.id} user={user} isSelf={user.id === selfId} onInvite={onInvite} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({ user, isSelf, onInvite }: { user: UserSummary; isSelf: boolean; onInvite: (invite: InviteCreated) => void }) {
  const setActive = useSetActive();
  const reissue = useReissueInvite();
  const [confirming, setConfirming] = useState(false);
  const error = setActive.error ?? reissue.error;

  return (
    <tr className="border-t border-border">
      <th scope="row" className="py-3 pr-4 font-semibold">
        {user.username}
        {isSelf ? <span className="ml-2 text-[12px] font-normal text-fg-subtle">you</span> : null}
      </th>
      <td className="py-3 pr-4 capitalize">{user.role.toLowerCase()}</td>
      <td className="py-3 pr-4">{STATUS_LABEL[user.status]}</td>
      <td className="py-3">
        <div className="flex flex-wrap items-center gap-2">
          {user.status === "INVITED" ? (
            <button
              onClick={() => reissue.mutate(user.id, { onSuccess: onInvite })}
              disabled={reissue.isPending}
              className="h-9 rounded-full border border-border-strong px-3 text-[13px] font-semibold hover:bg-surface-hover disabled:opacity-40"
            >
              New invite link
            </button>
          ) : null}
          {user.status === "DEACTIVATED" ? (
            <button
              onClick={() => setActive.mutate({ id: user.id, active: true })}
              disabled={setActive.isPending}
              className="h-9 rounded-full border border-border-strong px-3 text-[13px] font-semibold hover:bg-surface-hover disabled:opacity-40"
            >
              Reactivate
            </button>
          ) : null}
          {user.status !== "DEACTIVATED" && !isSelf && !confirming ? (
            <button onClick={() => setConfirming(true)} className="h-9 rounded-full px-3 text-[13px] font-semibold text-danger hover:bg-surface-hover">
              Deactivate
            </button>
          ) : null}
          {confirming ? (
            <>
              <button
                onClick={() => setActive.mutate({ id: user.id, active: false }, { onSettled: () => setConfirming(false) })}
                disabled={setActive.isPending}
                className="h-9 rounded-full bg-danger px-3 text-[13px] font-semibold text-on-accent disabled:opacity-40"
              >
                Confirm deactivate {user.username}
              </button>
              <button onClick={() => setConfirming(false)} className="h-9 rounded-full px-3 text-[13px] text-fg-muted hover:bg-surface-hover">
                Cancel
              </button>
            </>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="mt-1 text-[13px] text-danger">
            {error.message}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
