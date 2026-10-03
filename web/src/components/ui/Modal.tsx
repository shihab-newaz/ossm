"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** The accessible name, also shown as the heading. */
  title: string;
  /** A side drawer (the queue) or a centred dialog (help). */
  variant: "drawer" | "dialog";
  children: ReactNode;
};

/**
 * A modal surface: focus moves in when it opens, Tab stays inside, Escape or a click outside closes it,
 * and focus returns to whatever opened it. Built by hand because jsdom has no <dialog>.showModal().
 */
export function Modal({ open, onClose, title, variant, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusables = panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusables?.[0] ?? panel.current)?.focus();
    return () => opener?.focus();
  }, [open]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return event.preventDefault();
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const position = variant === "drawer" ? "justify-end" : "items-center justify-center p-4";
  const size =
    variant === "drawer"
      ? "h-full w-full max-w-[420px] rounded-l-banner"
      : "max-h-full w-full max-w-[480px] rounded-banner";

  return createPortal(
    <div className={`fixed inset-0 z-40 flex bg-[rgba(10,9,12,0.5)] ${position}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`flex flex-col gap-4 overflow-y-auto bg-surface p-6 shadow-[var(--shadow-3)] outline-none ${size}`}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full text-fg-muted hover:bg-surface-hover">
            <X size={20} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
