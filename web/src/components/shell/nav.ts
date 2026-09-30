import { Compass, Home, Library, Search, type LucideIcon } from "lucide-react";

export const navItems: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/explore", label: "Explore", Icon: Compass },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/library", label: "Library", Icon: Library },
];
