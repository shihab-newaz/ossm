"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { player } from "./player";
import { handleShortcut, SHORTCUTS } from "./keymap";

/** Listens for the player's keyboard shortcuts, and shows the "?" help dialog. Renders nothing otherwise. */
export function Shortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const ui = {
      showHelp: () => setHelpOpen((open) => !open),
      focusSearch: () => document.querySelector<HTMLInputElement>('input[type="search"]')?.focus(),
    };
    function onKeyDown(event: KeyboardEvent) {
      // Inside a dialog the keys belong to the dialog, except "?" which closes the help again.
      const inDialog = (event.target as HTMLElement | null)?.closest?.('[role="dialog"]');
      if (inDialog && event.key !== "?") return;
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
