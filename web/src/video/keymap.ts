import { activatesOnSpace, isTyping } from "@/player/keymap";
import type { VideoEngine } from "./engine";

export const VIDEO_SEEK_SECONDS = 5;
export const VIDEO_JUMP_SECONDS = 10;

/** What the help dialog lists under "Video". Keep this in step with {@link handleVideoShortcut}. */
export const VIDEO_SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["Space"], action: "Play or pause" },
  { keys: ["K"], action: "Play or pause" },
  { keys: ["←", "→"], action: "Seek back or forward 5 seconds" },
  { keys: ["J", "L"], action: "Seek back or forward 10 seconds" },
  { keys: ["F"], action: "Full screen" },
  { keys: ["M"], action: "Mute or unmute" },
  { keys: ["C"], action: "Subtitles on or off" },
];

export type VideoShortcutUi = { toggleFullscreen: () => void; toggleSubtitles: () => void };

/**
 * Runs a watch-page shortcut if the key is one, with the same guards as the music keys: never while
 * typing or with a modifier held, and Space stays with buttons and links. Returns true when it ran.
 */
export function handleVideoShortcut(event: KeyboardEvent, engine: VideoEngine, ui: VideoShortcutUi): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return false;
  const { currentTime, muted } = engine.getState();

  switch (event.key) {
    case " ":
      if (activatesOnSpace(event.target)) return false;
      void engine.toggle();
      return true;
    case "k":
    case "K":
      void engine.toggle();
      return true;
    case "ArrowLeft":
    case "ArrowRight":
      // Shift+arrows stay with the music (previous/next track).
      if (event.shiftKey) return false;
      engine.seek(currentTime + (event.key === "ArrowRight" ? VIDEO_SEEK_SECONDS : -VIDEO_SEEK_SECONDS));
      return true;
    case "j":
    case "J":
      engine.seek(currentTime - VIDEO_JUMP_SECONDS);
      return true;
    case "l":
    case "L":
      engine.seek(currentTime + VIDEO_JUMP_SECONDS);
      return true;
    case "f":
    case "F":
      ui.toggleFullscreen();
      return true;
    case "m":
    case "M":
      engine.setMuted(!muted);
      return true;
    case "c":
    case "C":
      ui.toggleSubtitles();
      return true;
    default:
      return false;
  }
}
