"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useState, type ReactNode } from "react";

type Props = {
  label: string;
  /** How many items there are in all, loaded or not. */
  count: number;
  /** Items per row: 1 for a list. */
  columns?: number;
  /** A first guess at a row's height in px; rows are measured once on screen. */
  rowHeight: number;
  /** Called with the index of the last item near the screen, so the caller can load more. */
  onNearEnd?: (lastVisibleIndex: number) => void;
  renderItem: (index: number) => ReactNode;
  gap?: number;
};

/**
 * A list or grid that only puts the rows near the screen into the page, so thousands of items
 * scroll as smoothly as ten. It scrolls with the window rather than inside a box of its own.
 */
export function VirtualGrid({ label, count, columns = 1, rowHeight, onNearEnd, renderItem, gap = 0 }: Props) {
  // Where the list starts on the page, measured once it is on screen.
  const [margin, setMargin] = useState(0);
  const root = useCallback((el: HTMLDivElement | null) => {
    if (el) setMargin(el.getBoundingClientRect().top + window.scrollY);
  }, []);
  const rows = Math.ceil(count / columns);
  const virtualizer = useWindowVirtualizer({
    count: rows,
    estimateSize: () => rowHeight,
    overscan: 6,
    gap,
    scrollMargin: margin,
  });
  const items = virtualizer.getVirtualItems();
  const lastRow = items.length > 0 ? items[items.length - 1].index : -1;

  useEffect(() => {
    if (lastRow >= 0) onNearEnd?.(Math.min((lastRow + 1) * columns, count) - 1);
  }, [lastRow, columns, count, onNearEnd]);

  return (
    <div ref={root} role="list" aria-label={label} style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {items.map((row) => (
        <div
          key={row.key}
          ref={virtualizer.measureElement}
          data-index={row.index}
          className="absolute left-0 top-0 w-full"
          style={{ transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)` }}
        >
          {columns === 1 ? (
            renderItem(row.index)
          ) : (
            <div className="grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap }}>
              {Array.from({ length: Math.min(columns, count - row.index * columns) }, (_, c) => (
                <div key={c} role="listitem">
                  {renderItem(row.index * columns + c)}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
