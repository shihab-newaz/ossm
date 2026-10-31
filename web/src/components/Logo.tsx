// The OSSM mark: an "O" ring left open at the top right (open source) around a play button.
// app/icon.svg is the favicon copy of the same drawing; keep the two in step.

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className={className}>
      <rect width="32" height="32" rx="8" fill="var(--text)" />
      <path d="M24.46 12.92A9 9 0 1 1 19.08 7.54" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      <path d="M14.25 12.5v7l5.75-3.5z" fill="var(--bg)" stroke="var(--bg)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** DESIGN.md 4.1: 32px mark + wordmark. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <LogoMark />
      <span className="font-display text-xl font-extrabold tracking-tight">OSSM</span>
    </span>
  );
}
