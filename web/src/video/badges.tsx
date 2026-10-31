/** The open-metadata badge (DESIGN.md 4.9) for video facts: "1080P · HEVC", "MKV". */
export function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center rounded-[4px] border border-border-strong px-1.5 font-mono text-[11px] font-medium text-fg-muted">
      {children}
    </span>
  );
}

/** Shown when OSSM thinks the browser may not play the file as stored. */
export function MayNotPlayBadge() {
  return (
    <span
      title="OSSM plays files as they were uploaded. This container or codec may not be supported by every browser."
      className="inline-flex h-5 items-center gap-1.5 rounded-[4px] border border-border-strong px-1.5 font-mono text-[11px] font-medium text-warning"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-warning" />
      May not play in this browser
    </span>
  );
}
