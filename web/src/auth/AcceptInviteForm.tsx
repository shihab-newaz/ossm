"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Field, FormError, PrimaryButton } from "@/components/ui/form";
import { useAcceptInvite, useInvite } from "./account";

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const invite = useInvite(token);
  const accept = useAcceptInvite(token);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;

  useEffect(() => {
    if (accept.isSuccess) router.replace("/");
  }, [accept.isSuccess, router]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!mismatch) accept.mutate(password);
  }

  if (invite.isPending) return <p role="status" className="text-fg-subtle">Loading…</p>;
  if (invite.isError) return <FormError>Can&apos;t reach the OSSM server.</FormError>;
  if (!invite.data) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em]">Invite not valid</h1>
        <p role="alert" className="text-fg-muted">
          This invite link is not valid or has expired. Ask the admin for a new one.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em]">Welcome, {invite.data.username}</h1>
        <p className="text-fg-muted">Choose a password to finish creating your account.</p>
      </div>
      {accept.isError ? <FormError>{accept.error.message}</FormError> : null}
      <Field
        id="password"
        label="Password"
        hint="At least 12 characters."
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <Field
        id="confirm"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        aria-invalid={mismatch}
        required
      />
      {mismatch ? <p className="-mt-2 text-[13px] text-danger">Passwords do not match.</p> : null}
      <PrimaryButton type="submit" disabled={accept.isPending || !password || !confirm || mismatch}>
        {accept.isPending ? "Saving…" : "Set password and continue"}
      </PrimaryButton>
    </form>
  );
}
