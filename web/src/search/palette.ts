import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (open === next) return;
  open = next;
  listeners.forEach((listener) => listener());
}

/** Whether the search palette is showing. A module store so a key press anywhere, or the top bar, can open it. */
export const searchPalette = {
  open: () => set(true),
  close: () => set(false),
  toggle: () => set(!open),
};

export function useSearchPaletteOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
    () => false,
  );
}
