"use client";

import { Search, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { searchPalette } from "@/search/palette";
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
      {/* The pill opens the search palette; the typing happens there, so Ctrl+K, "/" and a click all land in one place. */}
      <button
        onClick={searchPalette.open}
        aria-label="Search your library"
        aria-haspopup="dialog"
        className="relative flex h-11 w-full max-w-[480px] items-center rounded-full bg-bg-subtle pl-11 pr-4 text-left text-[15px] text-fg-subtle hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus"
      >
        <Search size={20} aria-hidden className="pointer-events-none absolute left-4 top-3 text-fg-subtle" />
        <span className="flex-1 truncate">Search your library</span>
        <kbd aria-hidden className="hidden rounded-md border border-border-strong px-1.5 py-0.5 font-mono text-[11px] text-fg-muted md:block">
          Ctrl K
        </kbd>
      </button>
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
