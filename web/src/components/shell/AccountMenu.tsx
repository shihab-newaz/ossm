"use client";

import { AlertTriangle, LogOut, Settings, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLogout, useMe } from "@/auth/session";

export function AccountMenu() {
  const user = useMe().data;
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid size-11 place-items-center rounded-full"
      >
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-fg text-[14px] font-semibold uppercase text-bg">
          {user.username.charAt(0)}
        </span>
      </button>
      {open ? (
        <div role="menu" aria-label="Account" className="absolute right-0 top-12 z-30 w-56 rounded-card border border-border bg-surface p-2 shadow-[var(--shadow-up)]">
          <div className="px-3 py-2">
            <p className="truncate font-semibold">{user.username}</p>
            <p className="text-[12px] capitalize text-fg-subtle">{user.role.toLowerCase()}</p>
          </div>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="flex h-10 items-center gap-3 rounded-lg px-3 hover:bg-surface-hover">
            <Settings size={18} aria-hidden />
            Settings
          </Link>
          {user.role === "ADMIN" ? (
            <Link role="menuitem" href="/admin/users" onClick={() => setOpen(false)} className="flex h-10 items-center gap-3 rounded-lg px-3 hover:bg-surface-hover">
              <Users size={18} aria-hidden />
              Manage users
            </Link>
          ) : null}
          {user.role === "ADMIN" ? (
            <Link role="menuitem" href="/admin/ingest" onClick={() => setOpen(false)} className="flex h-10 items-center gap-3 rounded-lg px-3 hover:bg-surface-hover">
              <AlertTriangle size={18} aria-hidden />
              Failed uploads
            </Link>
          ) : null}
          <button
            role="menuitem"
            onClick={() => logout.mutate()}
            className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-surface-hover"
          >
            <LogOut size={18} aria-hidden />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
