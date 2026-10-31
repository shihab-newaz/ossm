"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "ossm-theme";
const listeners = new Set<() => void>();

export function savedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Shows a page in the dark theme whatever the setting, while it is mounted (the watch page, like the
 * full-screen player). Leaving puts the saved theme back.
 */
export function useForcedDarkTheme() {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    return () => applyTheme(savedTheme());
  }, []);
}

function set(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage can be blocked; the theme still applies for this page view.
  }
  applyTheme(theme);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const options: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribe, savedTheme, () => "system" as Theme);
  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-1 rounded-full bg-bg-subtle p-1">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          onClick={() => set(value)}
          className="grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-hover hover:text-fg aria-checked:bg-surface-active aria-checked:text-fg"
        >
          <Icon size={18} aria-hidden />
        </button>
      ))}
    </div>
  );
}
