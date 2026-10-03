import Link from "next/link";
import type { components } from "@/api/schema";
import { tileColor } from "./genreColor";

type Genre = components["schemas"]["Genre"];

/**
 * The signature tile: a flat colour chosen from the genre, its name top-left, and a cover tilted
 * 18 degrees and bleeding off the bottom-right corner. The tilt and the hover motion only
 * happen for people who have not asked for reduced motion.
 */
export function GenreTile({ genre }: { genre: Genre }) {
  return (
    <Link
      href={`/library?genre=${encodeURIComponent(genre.slug)}`}
      style={{ backgroundColor: tileColor(genre.slug) }}
      className="group relative block aspect-square overflow-hidden rounded-tile p-4 text-white motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[var(--ease-out)] motion-safe:hover:scale-[1.02] md:aspect-video"
    >
      <span className="relative z-10 block font-display text-lg font-extrabold leading-6">{genre.name}</span>
      <span className="relative z-10 mt-1 block text-[12px] font-medium opacity-90">
        {genre.trackCount} {genre.trackCount === 1 ? "track" : "tracks"}
      </span>
      {genre.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authenticated cover art
        <img
          src={genre.coverUrl}
          alt=""
          data-testid="tile-art"
          loading="lazy"
          className="absolute -bottom-[12%] -right-[8%] aspect-square h-[55%] rounded-lg object-cover shadow-[var(--shadow-2)] motion-safe:rotate-[18deg] motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[var(--ease-out)] motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:rotate-[12deg]"
        />
      ) : null}
    </Link>
  );
}
