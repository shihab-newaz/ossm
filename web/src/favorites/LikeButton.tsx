"use client";

import { Heart } from "lucide-react";
import { useState } from "react";
import { useIsLiked, useToggleLike } from "./data";

type Props = {
  track: { id: string; title: string };
  /** In a track row on desktop the heart waits for hover or focus, unless the track is liked. The row must be a `group`. */
  revealOnHover?: boolean;
  className?: string;
};

/** The like toggle (DESIGN.md 4.4): a ghost heart that fills with the accent and pops once, in 200 ms, when liked. */
export function LikeButton({ track, revealOnHover = false, className = "" }: Props) {
  const liked = useIsLiked(track.id);
  const toggle = useToggleLike();
  // The pop belongs to the click that liked it, not to every liked heart that scrolls into view.
  const [popped, setPopped] = useState(false);

  const hidden = revealOnHover && !liked ? "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" : "";
  return (
    <button
      // One label whatever the state: aria-pressed says whether it is on.
      aria-label={`Like ${track.title}`}
      aria-pressed={liked}
      onClick={() => {
        setPopped(!liked);
        toggle(track);
      }}
      className={`grid size-9 shrink-0 place-items-center rounded-full hover:bg-surface-active focus-visible:opacity-100 ${liked ? "text-accent" : "text-fg-muted"} ${hidden} ${className}`}
    >
      <Heart
        size={18}
        aria-hidden
        fill={liked ? "currentColor" : "none"}
        className={liked && popped ? "motion-safe:animate-[like-pop_200ms_var(--ease-out)]" : ""}
        onAnimationEnd={() => setPopped(false)}
      />
    </button>
  );
}
