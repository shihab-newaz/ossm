"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useId, type ReactNode } from "react";

/**
 * A row of cards that scrolls sideways and snaps to a card. Arrow buttons appear on wide screens;
 * touch and trackpads just swipe. Every card stays reachable by keyboard.
 */
export function Carousel({ title, items }: { title: string; items: ReactNode[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const headingId = useId();

  function scroll(direction: -1 | 1) {
    const el = scroller.current;
    el?.scrollBy?.({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id={headingId} className="font-display text-xl font-bold">
          {title}
        </h2>
        <div className="hidden gap-2 md:flex">
          <button onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`} className="grid size-9 place-items-center rounded-full text-fg-muted hover:bg-surface-hover hover:text-fg">
            <ChevronLeft size={20} aria-hidden />
          </button>
          <button onClick={() => scroll(1)} aria-label={`Scroll ${title} right`} className="grid size-9 place-items-center rounded-full text-fg-muted hover:bg-surface-hover hover:text-fg">
            <ChevronRight size={20} aria-hidden />
          </button>
        </div>
      </div>
      <div
        ref={scroller}
        role="list"
        aria-label={title}
        className="-mx-2 flex snap-x snap-mandatory gap-2 overflow-x-auto px-2 pb-2 motion-safe:scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <div key={i} role="listitem" className="w-40 shrink-0 snap-start sm:w-44">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}
