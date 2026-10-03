import { Disc3, Mic2, Music } from "lucide-react";
import Link from "next/link";

export function ListSkeleton({ label = "Loading your library" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      {[0, 1, 2, 3, 4].map((n) => (
        <div key={n} className="flex items-center gap-4 px-2 motion-safe:animate-pulse">
          <div className="size-10 rounded-lg bg-bg-subtle" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3 w-1/3 rounded bg-bg-subtle" />
            <div className="h-3 w-1/4 rounded bg-bg-subtle" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <div key={n} className="flex flex-col gap-2 motion-safe:animate-pulse">
          <div className="aspect-square rounded-card bg-bg-subtle" />
          <div className="h-3 w-2/3 rounded bg-bg-subtle" />
          <div className="h-3 w-1/2 rounded bg-bg-subtle" />
        </div>
      ))}
    </div>
  );
}

const ICONS = { music: Music, album: Disc3, artist: Mic2 };

export function EmptyState({ kind, title, body }: { kind: keyof typeof ICONS; title: string; body: string }) {
  const Icon = ICONS[kind];
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <Icon size={64} aria-hidden strokeWidth={1.25} className="text-fg-subtle" />
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <p className="text-fg-muted">{body}</p>
      <Link href="/upload" className="grid h-10 place-items-center rounded-full border border-border-strong px-5 text-[15px] font-semibold hover:bg-surface-hover">
        Upload music
      </Link>
    </div>
  );
}
