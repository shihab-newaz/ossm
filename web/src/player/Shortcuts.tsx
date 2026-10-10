"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToggleLike } from "@/favorites/data";
import { searchPalette } from "@/search/palette";
import { player } from "./player";
import { handleShortcut, SHORTCUTS } from "./keymap";

/** Listens for the player's keyboard shortcuts, and shows the "?" help dialog. Renders nothing otherwise. */
export function Shortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);
  const toggleLike = useToggleLike();
  // The listener below is set up once; this keeps it calling the latest function.
  const toggleLikeRef = useRef(toggleLike);
  useEffect(() => {
    toggleLikeRef.current = toggleLike;
  });

  useEffect(() => {
    const ui = {
      showHelp: () => setHelpOpen((open) => !open),
      toggleLike: (track: { id: string; title: string }) => toggleLikeRef.current(track),
      openSearch: () => {
        setHelpOpen(false);
        searchPalette.open();
      },
    };
    function onKeyDown(event: KeyboardEvent) {
      // Inside a dialog the keys belong to the dialog, except "?" which closes the help again and
      // Ctrl/Cmd+K, which opens search from anywhere (and is harmless once it is already open).
      const inDialog = (event.target as HTMLElement | null)?.closest?.('[role="dialog"]');
      const opensSearch = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (inDialog && event.key !== "?" && !opensSearch) return;
      if (handleShortcut(event, player, ui)) event.preventDefault();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts" variant="dialog">
      <dl className="flex flex-col gap-3">
        {SHORTCUTS.map(({ keys, action }) => (
          <div key={action} className="flex items-center justify-between gap-4">
            <dt className="text-fg-muted">{action}</dt>
            <dd className="flex gap-1">
              {keys.map((key) => (
                <kbd key={key} className="min-w-7 rounded-md border border-border-strong bg-bg-subtle px-2 py-0.5 text-center font-mono text-[12px] font-medium">
                  {key}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
