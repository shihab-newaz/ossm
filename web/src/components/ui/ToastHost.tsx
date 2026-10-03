"use client";

import { toast, useToasts } from "./toast";

/** Bottom-centre, above the player bar (DESIGN.md 4.10). */
export function ToastHost() {
  const toasts = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--player-height)+var(--tabbar-height)+16px)] z-30 flex flex-col items-center gap-2 px-4 lg:bottom-[calc(var(--player-height)+16px)]"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className="pointer-events-auto flex min-h-11 max-w-full items-center gap-3 rounded-full bg-fg px-5 py-2 text-[14px] text-bg shadow-[var(--shadow-3)]"
        >
          <span>{t.message}</span>
          <button onClick={() => toast.dismiss(t.id)} aria-label="Dismiss" className="-mr-2 grid size-8 place-items-center rounded-full text-[18px] hover:bg-bg/15">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
