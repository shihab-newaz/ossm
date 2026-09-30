"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, navItems } from "./nav";

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid h-[var(--tabbar-height)] grid-cols-4 border-t border-border bg-surface lg:hidden"
    >
      {navItems.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] text-fg-muted aria-[current=page]:text-fg"
          >
            <Icon size={24} aria-hidden className={active ? "text-accent" : ""} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
