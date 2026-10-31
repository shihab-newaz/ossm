import { Check, Clapperboard, Play } from "lucide-react";

type Props = {
  src?: string;
  /** 12px on cards, 8px in rows, none inside the player. */
  radius?: "card" | "row" | "none";
  /** "14:48", shown bottom-right. */
  duration?: string;
  /** 0 to 100: how far someone is. 0 hides the bar. */
  progress?: number;
  watched?: boolean;
  /** The file may not play in this browser. */
  warn?: boolean;
  /** A title on a scrim, bottom-left (show cards). */
  label?: string;
  /** What appears on hover of the surrounding `group`: the orange play button, a centred play icon, or nothing. */
  hover?: "fab" | "center" | "none";
  shadow?: boolean;
  className?: string;
};

const RADIUS = { card: "rounded-card", row: "rounded-lg", none: "" };

/** A 16:9 video thumbnail with its overlays (DESIGN.md tokens; spec 03 video rules). */
export function Thumb({ src, radius = "card", duration, progress = 0, watched, warn, label, hover = "none", shadow, className = "" }: Props) {
  const bottom = progress > 0 ? "bottom-[11px]" : "bottom-2";
  return (
    <div className={`relative aspect-video w-full shrink-0 overflow-hidden bg-bg-subtle ${RADIUS[radius]} ${shadow ? "shadow-[var(--shadow-2)]" : ""} ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authenticated thumbnail
        <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        <span aria-hidden className="absolute inset-0 grid place-items-center text-fg-subtle">
          <Clapperboard size={32} strokeWidth={1.5} />
        </span>
      )}

      {label ? (
        <>
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent to-60%" />
          <span className="absolute bottom-3.5 left-4 right-16 truncate font-display text-xl font-extrabold leading-[1.2] tracking-[-0.01em] text-white">{label}</span>
        </>
      ) : null}

      {duration ? (
        <span
          className={`absolute right-2 ${bottom} h-5 rounded-full bg-black/60 px-1.5 font-mono text-[11px] font-medium leading-5 tabular-nums text-white transition-opacity duration-150 ${
            hover === "fab" ? "group-hover:opacity-0 group-focus-visible:opacity-0" : ""
          }`}
        >
          {duration}
        </span>
      ) : null}

      {watched ? (
        <span role="img" aria-label="Watched" className="absolute right-2 top-2 grid size-[22px] place-items-center rounded-full bg-success text-white">
          <Check size={14} strokeWidth={3} aria-hidden />
        </span>
      ) : null}

      {warn ? (
        <span role="img" aria-label="May not play in this browser" title="May not play in this browser" className="absolute left-2 top-2 grid size-[22px] place-items-center rounded-full bg-black/60">
          <span className="size-2 rounded-full bg-warning" />
        </span>
      ) : null}

      {progress > 0 ? (
        <span role="progressbar" aria-label="Watched so far" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="absolute inset-x-0 bottom-0 h-[3px] bg-border-strong">
          <span className="block h-full bg-accent" style={{ width: `${progress}%` }} />
        </span>
      ) : null}

      {hover === "center" ? (
        <span aria-hidden className="absolute inset-0 hidden place-items-center bg-black/35 text-white group-hover:grid group-focus-visible:grid">
          <Play size={28} fill="currentColor" />
        </span>
      ) : null}

      {hover === "fab" ? (
        <span
          aria-hidden
          className={`absolute right-2 ${bottom} grid size-12 translate-y-2 place-items-center rounded-full bg-accent text-on-accent opacity-0 shadow-[var(--shadow-2)] transition duration-[180ms] ease-[var(--ease-out)] group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100`}
        >
          <Play size={22} fill="currentColor" />
        </span>
      ) : null}
    </div>
  );
}
