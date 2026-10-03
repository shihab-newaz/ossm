import { useSyncExternalStore } from "react";

export type Toast = { id: number; message: string; kind: "info" | "error" };

const DISMISS_AFTER_MS = 4000;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function publish(next: Toast[]) {
  toasts = next;
  listeners.forEach((listener) => listener());
}

function show(message: string, kind: Toast["kind"]) {
  const id = nextId++;
  // One at a time: a new message replaces the last rather than stacking up over the player.
  publish([{ id, message, kind }]);
  setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
}

function dismiss(id: number) {
  if (toasts.some((t) => t.id === id)) publish(toasts.filter((t) => t.id !== id));
}

export const toast = {
  info: (message: string) => show(message, "info"),
  error: (message: string) => show(message, "error"),
  dismiss,
  /** For tests. */
  clear: () => publish([]),
};

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => toasts,
    () => toasts,
  );
}
