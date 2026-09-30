import { ListMusic, Play, SkipBack, SkipForward } from "lucide-react";

// Placeholder for the persistent player. Real playback arrives with the stream-and-play slice.
export function PlayerBar() {
  return (
    <section
      aria-label="Player"
      className="fixed inset-x-0 bottom-[var(--tabbar-height)] z-20 flex h-16 items-center justify-between border-t border-border bg-surface px-4 shadow-[var(--shadow-up)] lg:bottom-0 lg:h-20 lg:px-6"
    >
      <p className="text-[14px] text-fg-subtle">Nothing playing</p>
      <div className="flex items-center gap-2">
        <button aria-label="Previous" disabled className="hidden size-11 place-items-center rounded-full text-fg-muted opacity-40 sm:grid">
          <SkipBack size={20} aria-hidden />
        </button>
        <button aria-label="Play" disabled className="grid size-10 place-items-center rounded-full bg-accent text-on-accent opacity-40">
          <Play size={20} aria-hidden fill="currentColor" />
        </button>
        <button aria-label="Next" disabled className="hidden size-11 place-items-center rounded-full text-fg-muted opacity-40 sm:grid">
          <SkipForward size={20} aria-hidden />
        </button>
      </div>
      <button aria-label="Queue" disabled className="grid size-11 place-items-center rounded-full text-fg-muted opacity-40">
        <ListMusic size={20} aria-hidden />
      </button>
    </section>
  );
}
