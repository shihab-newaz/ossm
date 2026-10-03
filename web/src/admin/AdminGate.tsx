"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMe } from "@/auth/session";

/**
 * Admin pages render only for admins. The API refuses everyone else too; this just keeps the page
 * from pretending to exist for them.
 */
export function AdminGate({ children }: { children: (adminId: string) => ReactNode }) {
  const me = useMe().data;
  if (me && me.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-start gap-3 py-10">
        <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em]">Page not found</h1>
        <p className="text-fg-muted">There is nothing here for your account.</p>
        <Link href="/" className="text-accent underline">
          Back to home
        </Link>
      </div>
    );
  }
  return <>{me ? children(me.id) : null}</>;
}
