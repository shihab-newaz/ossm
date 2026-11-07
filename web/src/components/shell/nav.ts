import { Clapperboard, Compass, Home, Library, Search, type LucideIcon } from "lucide-react";

export const navItems: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/explore", label: "Explore", Icon: Compass },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/library", label: "Library", Icon: Library },
  { href: "/videos", label: "Videos", Icon: Clapperboard },
];

// Pages that belong to a nav item without living under its address: watching a video is part of Videos.
const ALSO_ACTIVE: Record<string, string[]> = { "/videos": ["/watch"] };

export const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : [href, ...(ALSO_ACTIVE[href] ?? [])].some((prefix) => pathname.startsWith(prefix));
