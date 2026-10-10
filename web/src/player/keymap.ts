import type { Player } from "./player";

export const SEEK_STEP_SECONDS = 5;

/** What the help dialog lists. Keep this in step with {@link handleShortcut}. */
export const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["Space"], action: "Play or pause" },
  { keys: ["←", "→"], action: "Seek back or forward 5 seconds" },
  { keys: ["Shift", "←"], action: "Previous track" },
  { keys: ["Shift", "→"], action: "Next track" },
  { keys: ["M"], action: "Mute or unmute" },
  { keys: ["L"], action: "Like or unlike the current track" },
  { keys: ["/"], action: "Search" },
  { keys: ["Ctrl", "K"], action: "Search, even while typing (⌘K on a Mac)" },
  { keys: ["?"], action: "Show this list" },
];

/** True when keystrokes belong to a form control, so shortcuts must stay out of the way. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Elements that already do something with Space (and Enter), where taking Space would break them. */
function activatesOnSpace(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('button, a[href], summary, [role="button"], [role="menuitem"], [role="switch"], [role="checkbox"]');
}

export type ShortcutUi = { showHelp: () => void; openSearch: () => void; toggleLike: (track: { id: string; title: string }) => void };

/** Runs a keyboard shortcut if the key is one. Returns true when it did, so the caller can stop the browser's own action. */
export function handleShortcut(event: KeyboardEvent, player: Player, ui: ShortcutUi): boolean {
  // Ctrl/Cmd+K is the one shortcut that works from inside a field, as it does in most apps.
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
    ui.openSearch();
    return true;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return false;
  const { track } = player.getState();

  switch (event.key) {
    case " ":
      if (!track || activatesOnSpace(event.target)) return false;
      void player.toggle();
      return true;
    case "ArrowLeft":
    case "ArrowRight": {
      if (!track) return false;
      const forward = event.key === "ArrowRight";
      if (event.shiftKey) void (forward ? player.next() : player.previous());
      else player.seek(player.getState().currentTime + (forward ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS));
      return true;
    }
    case "m":
    case "M":
      player.setMuted(!player.getState().muted);
      return true;
    case "l":
    case "L":
      if (!track) return false;
      ui.toggleLike(track);
      return true;
    case "/":
      ui.openSearch();
      return true;
    case "?":
      ui.showHelp();
      return true;
    default:
      return false;
  }
}
