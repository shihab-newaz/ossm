import { quality } from "./quality";

/** Codec and bitrate, like "FLAC" or "MP3 320". Lossless formats get a green dot. */
export function QualityBadge({ codec, bitrateKbps }: { codec?: string; bitrateKbps?: number }) {
  const q = quality(codec, bitrateKbps);
  if (!q) return null;
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-[4px] border border-border-strong px-1.5 font-mono text-[11px] font-medium text-fg-muted">
      {q.lossless ? <span aria-label="Lossless" role="img" className="size-1.5 rounded-full bg-success" /> : null}
      {q.label}
    </span>
  );
}
