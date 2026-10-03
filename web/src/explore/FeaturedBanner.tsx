"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import Link from "next/link";
import type { components } from "@/api/schema";
import { playAlbum } from "@/library/playAlbum";
import { washColor } from "@/library/wash";

type Album = components["schemas"]["Album"];

/** The big banner at the top of Explore: the album to feature, with a scrim so its title stays readable. */
export function FeaturedBanner({ album }: { album: Album }) {
  const client = useQueryClient();
  return (
    <section
      aria-label="Featured album"
      style={{ backgroundColor: washColor(album.dominantColor) ?? undefined }}
      className="relative flex h-[200px] items-end overflow-hidden rounded-banner bg-bg-subtle text-white md:h-[280px]"
    >
      {album.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authenticated cover art
        <img src={album.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
      ) : null}
      {/* A 0 to 60% black scrim: text on artwork always has one. */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      <div className="relative flex w-full items-end justify-between gap-4 p-5 md:p-8">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-wider opacity-90">Featured album</p>
          <h2 className="truncate font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">
            <Link href={`/albums/${album.id}`} className="after:absolute after:inset-0 hover:underline">
              {album.title}
            </Link>
          </h2>
          <p className="truncate text-[15px]">{[album.artist, album.year].filter(Boolean).join(" · ")}</p>
        </div>
        <button
          onClick={() => void playAlbum(client, album.id)}
          aria-label={`Play ${album.title}`}
          className="relative z-10 grid size-14 shrink-0 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--shadow-2)] hover:bg-accent-hover active:scale-[0.97]"
        >
          <Play size={24} aria-hidden fill="currentColor" />
        </button>
      </div>
    </section>
  );
}
