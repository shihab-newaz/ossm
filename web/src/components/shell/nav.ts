import { Clapperboard, Compass, Home, Library, Search, type LucideIcon } from "lucide-react";

type NavItem = { href: string; label: string; Icon: LucideIcon };

/** The mobile tab bar: four tabs. Videos is reached from Library there. */
export const navItems: NavItem[] = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/explore", label: "Explore", Icon: Compass },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/library", label: "Library", Icon: Library },
];

/** The desktop sidebar has room for Videos as its own item. */
export const sidebarItems: NavItem[] = [...navItems, { href: "/videos", label: "Videos", Icon: Clapperboard }];

/** Video pages belong to Videos in the sidebar. */
const VIDEO_PATHS = ["/videos", "/watch"];
const isVideoPath = (pathname: string) => VIDEO_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export const isActive = (pathname: string, href: string) => {
  if (href === "/") return pathname === "/";
  if (href === "/videos") return isVideoPath(pathname);
  return pathname.startsWith(href);
};

/** On the tab bar, video pages light up Library, where Videos lives on a phone. */
export const isTabActive = (pathname: string, href: string) => isActive(pathname, href) || (href === "/library" && isVideoPath(pathname));
