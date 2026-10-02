import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/auth/LoginForm";

export const metadata: Metadata = { title: "Log in · OSSM" };

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary so the page can still be prerendered.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
