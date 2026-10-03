"use client";

import { Search, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountMenu } from "./AccountMenu";
import { ThemeSwitcher } from "./ThemeSwitcher";

export function TopBar() {
  // DESIGN.md 4.1: the blur only appears once the page has scrolled.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-10 flex h-16 items-center gap-4 px-4 md:px-6 lg:px-8 ${
        scrolled ? "bg-bg/85 backdrop-blur-[12px]" : "bg-bg"
      }`}
    >
      <form role="search" className="relative w-full max-w-[480px]">
        <Search size={20} aria-hidden className="pointer-events-none absolute left-4 top-3 text-fg-subtle" />
        <input
          type="search"
          aria-label="Search your library"
          placeholder="Search your library"
          className="h-11 w-full rounded-full bg-bg-subtle pl-11 pr-4 text-[15px] placeholder:text-fg-subtle focus:bg-surface focus:outline-2 focus:outline-offset-0 focus:outline-focus"
        />
      </form>
      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/upload"
          aria-label="Upload"
          className="grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-hover hover:text-fg sm:size-auto sm:h-10 sm:grid-flow-col sm:gap-2 sm:border sm:border-border-strong sm:px-4 sm:text-fg"
        >
          <Upload size={18} aria-hidden />
          <span className="hidden text-[14px] font-semibold sm:inline">Upload</span>
        </Link>
        <ThemeSwitcher />
        <AccountMenu />
      </div>
    </header>
  );
}
