"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";
import { useMe } from "@/auth/session";
import { isActive, navItems } from "./nav";

export function Sidebar() {
  const pathname = usePathname();
  const isAdmin = useMe().data?.role === "ADMIN";
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-6 bg-bg-subtle p-4 lg:flex" aria-label="Sidebar">
      <div className="flex items-center gap-3 px-2 pt-2">
        <span aria-hidden className="grid size-8 place-items-center rounded-card bg-fg font-display font-extrabold text-bg">
          O
        </span>
        <span className="font-display text-xl font-extrabold tracking-tight">OSSM</span>
      </div>
      <nav aria-label="Main">
        <ul className="flex flex-col gap-1">
          {navItems.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="group flex h-10 items-center gap-3 rounded-card px-3 text-[15px] font-medium text-fg-muted hover:bg-surface-hover aria-[current=page]:bg-surface-active aria-[current=page]:text-fg"
                >
                  <Icon size={20} aria-hidden className="group-aria-[current=page]:text-accent" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {isAdmin ? (
        <nav aria-label="Admin">
          <h2 className="px-3 pb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Admin</h2>
          <Link
            href="/admin/users"
            aria-current={isActive(pathname, "/admin/users") ? "page" : undefined}
            className="group flex h-10 items-center gap-3 rounded-card px-3 text-[15px] font-medium text-fg-muted hover:bg-surface-hover aria-[current=page]:bg-surface-active aria-[current=page]:text-fg"
          >
            <Users size={20} aria-hidden className="group-aria-[current=page]:text-accent" />
            Users
          </Link>
        </nav>
      ) : null}
      <div className="flex-1">
        <h2 className="px-3 pb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Your library</h2>
        <p className="px-3 text-[13px] text-fg-subtle">Playlists will show up here.</p>
      </div>
    </aside>
  );
}
