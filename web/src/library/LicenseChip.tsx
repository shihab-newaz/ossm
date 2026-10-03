"use client";

import { useEffect, useId, useRef, useState } from "react";
import { licenseInfo } from "./licenses";

/** The track's license as a chip. Clicking it explains what the license allows. */
export function LicenseChip({ license }: { license: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();
  const info = licenseInfo(license);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={root} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-5 items-center rounded-[4px] border border-border-strong px-1.5 font-mono text-[11px] font-medium text-fg-muted hover:bg-surface-hover"
      >
        {info.label}
      </button>
      {open ? (
        <span
          id={id}
          role="note"
          className="absolute left-0 top-full z-30 mt-2 block w-72 rounded-card border border-border bg-surface p-3 text-left font-sans text-[13px] font-normal leading-5 text-fg shadow-[var(--shadow-3)]"
        >
          <strong className="mb-1 block font-semibold">{info.label}</strong>
          {info.summary}
        </span>
      ) : null}
    </span>
  );
}
