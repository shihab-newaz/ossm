"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Field, FormError, PrimaryButton } from "@/components/ui/form";
import { useSetup, useSetupStatus } from "./session";

export function SetupForm() {
  const router = useRouter();
  const status = useSetupStatus();
  const setup = useSetup();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;

  // Once an admin exists this screen is gone for good.
  useEffect(() => {
    if (status.data && !status.data.setupRequired) router.replace(setup.isSuccess ? "/" : "/login");
  }, [status.data, setup.isSuccess, router]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    setup.mutate({ username: username.trim(), password });
  }

  if (!status.data?.setupRequired && !setup.isSuccess) {
    return status.isError ? <FormError>Can&apos;t reach the OSSM server.</FormError> : <p role="status" className="text-fg-subtle">Loading…</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em]">Set up OSSM</h1>
        <p className="text-fg-muted">Create the admin account for this server. You will add other people afterwards.</p>
      </div>
      {setup.isError ? <FormError>{setup.error.message}</FormError> : null}
      <Field
        id="username"
        label="Username"
        hint="Lowercase letters, digits, dots, dashes and underscores. 3 to 32 characters."
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
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
      <PrimaryButton type="submit" disabled={setup.isPending || !username.trim() || !password || mismatch || !confirm}>
        {setup.isPending ? "Creating account…" : "Create admin account"}
      </PrimaryButton>
    </form>
  );
}
