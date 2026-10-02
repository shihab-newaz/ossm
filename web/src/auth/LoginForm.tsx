"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Field, FormError, PrimaryButton } from "@/components/ui/form";
import { safeNext, useLogin, useMe, useSetupStatus } from "./session";

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const me = useMe();
  const setup = useSetupStatus();
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Already signed in (or just did): go where they were headed. Fresh instance: claim it first.
  useEffect(() => {
    if (me.data) router.replace(next);
    else if (setup.data?.setupRequired) router.replace("/setup");
  }, [me.data, setup.data, next, router]);

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate({ username: username.trim(), password });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em]">Log in</h1>
      {login.isError ? <FormError>{login.error.message}</FormError> : null}
      <Field
        id="username"
        label="Username"
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
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <PrimaryButton type="submit" disabled={login.isPending || !username.trim() || !password}>
        {login.isPending ? "Logging in…" : "Log in"}
      </PrimaryButton>
    </form>
  );
}
