import { Search } from "lucide-react";
import { ThemeSwitcher } from "./ThemeSwitcher";

export function TopBar() {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 bg-bg/85 px-4 backdrop-blur-[12px] md:px-6 lg:px-8">
      <form role="search" className="relative w-full max-w-[480px]">
        <Search size={20} aria-hidden className="pointer-events-none absolute left-4 top-3 text-fg-subtle" />
        <input
          type="search"
          aria-label="Search your library"
          placeholder="Search your library"
          className="h-11 w-full rounded-full bg-bg-subtle pl-11 pr-4 text-[15px] placeholder:text-fg-subtle focus:bg-surface focus:outline-2 focus:outline-offset-0 focus:outline-focus"
        />
      </form>
      <div className="ml-auto">
        <ThemeSwitcher />
      </div>
    </header>
  );
}
