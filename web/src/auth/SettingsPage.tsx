"use client";

import { useState, type FormEvent } from "react";
import { Field, FormError, PrimaryButton } from "@/components/ui/form";
import { HealthIndicator } from "@/components/HealthIndicator";
import { ThemeSwitcher } from "@/components/shell/ThemeSwitcher";
import { useChangePassword } from "./account";

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-10 py-8">
      <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">Settings</h1>
      <section aria-labelledby="theme-heading" className="flex flex-col gap-3">
        <h2 id="theme-heading" className="font-display text-xl font-bold">
          Theme
        </h2>
        <p className="text-fg-muted">Light, dark, or follow your device. Remembered in this browser.</p>
        <div className="self-start">
          <ThemeSwitcher />
        </div>
      </section>
      <ChangePasswordForm />
      <section aria-labelledby="status-heading" className="flex flex-col gap-3">
        <h2 id="status-heading" className="font-display text-xl font-bold">
          Server status
        </h2>
        <HealthIndicator />
      </section>
    </div>
  );
}

function ChangePasswordForm() {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== next;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
          setConfirm("");
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4" noValidate aria-labelledby="password-heading">
      <h2 id="password-heading" className="font-display text-xl font-bold">
        Change password
      </h2>
      {change.isError ? <FormError>{change.error.message}</FormError> : null}
      {change.isSuccess ? (
        <p role="status" className="rounded-card bg-bg-subtle px-4 py-3 text-[14px]">
          Password changed. Your other devices have been logged out.
        </p>
      ) : null}
      <Field id="current-password" label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      <Field
        id="new-password"
        label="New password"
        hint="At least 12 characters."
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        required
      />
      <Field
        id="confirm-password"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        aria-invalid={mismatch}
        required
      />
      {mismatch ? <p className="-mt-2 text-[13px] text-danger">Passwords do not match.</p> : null}
      <PrimaryButton type="submit" disabled={change.isPending || !current || !next || !confirm || mismatch}>
        {change.isPending ? "Changing…" : "Change password"}
      </PrimaryButton>
    </form>
  );
}
