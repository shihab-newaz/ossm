import { vi } from "vitest";
import type { AudioLike } from "@/player/player";

/** jsdom cannot play media, so this stands in for the element and lets a test fire the events a browser would. */
export class FakeAudio extends EventTarget implements AudioLike {
  src = "";
  preload = "";
  currentTime = 0;
  duration = NaN;
  volume = 1;
  muted = false;
  paused = true;
  error: { code: number } | null = null;
  playRejection: Error | null = null;

  play = vi.fn(async () => {
    if (this.playRejection) throw this.playRejection;
    this.paused = false;
    this.fire("playing");
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.fire("pause");
  });
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => {
    if (name === "src") this.src = "";
  });
  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }
}
