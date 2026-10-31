"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Heart, Play, Shuffle } from "lucide-react";
import Link from "next/link";
import { toast } from "@/components/ui/toast";
import { ListSkeleton } from "@/library/states";
import { TrackRow } from "@/library/TrackRow";
import { useLoadMore } from "@/library/LibraryScreen";
import { VirtualGrid } from "@/library/VirtualGrid";
import { player } from "@/player/player";
import { fetchAllFavorites, useFavoritePages } from "./data";

/** What the user has liked, most recently liked first. */
export function LikedScreen() {
  const client = useQueryClient();
  const { items, total, query } = useFavoritePages();
  const nearEnd = useLoadMore(items.length, query);

  // Starting from a row plays every like in this order, which may be more than has loaded so far.
  async function start(index: number, opts?: { shuffle?: boolean; randomStart?: boolean }) {
    try {
      const tracks = items.length >= total ? items : await fetchAllFavorites(client);
      void player.playList(tracks, index, opts);
    } catch {
      toast.error("Could not load your likes.");
    }
  }

  return (
    <div className="flex flex-col gap-6 py-8">
      <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">Liked</h1>
      {query.isPending ? (
        <ListSkeleton label="Loading your likes" />
      ) : query.isError ? (
        <p role="alert" className="text-danger">
          Could not load your likes.
        </p>
      ) : total === 0 ? (
        <div className="flex flex-col items-start gap-3 py-10">
          <Heart size={64} aria-hidden strokeWidth={1.25} className="text-fg-subtle" />
          <h2 className="font-display text-xl font-bold">Nothing liked yet</h2>
          <p className="text-fg-muted">Tap the heart on a track, or press L while it plays, and it will be kept here.</p>
          <Link href="/library" className="grid h-10 place-items-center rounded-full border border-border-strong px-5 text-[15px] font-semibold hover:bg-surface-hover">
            Browse your library
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void start(0)}
              className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent hover:bg-accent-hover active:scale-[0.97]"
            >
              <Play size={18} aria-hidden fill="currentColor" />
              Play all
            </button>
            <button
              onClick={() => void start(0, { shuffle: true, randomStart: true })}
              className="flex h-11 items-center gap-2 rounded-full border border-border-strong px-5 text-[15px] font-semibold hover:bg-surface-hover"
            >
              <Shuffle size={18} aria-hidden />
              Shuffle all
            </button>
            <span className="ml-auto text-[13px] text-fg-muted">
              {total} {total === 1 ? "track" : "tracks"}
            </span>
          </div>
          <VirtualGrid
            label="Liked tracks"
            count={total}
            rowHeight={56}
            onNearEnd={nearEnd}
            renderItem={(i) => {
              const track = items[i];
              return track ? <TrackRow key={track.id} track={track} details onPlay={() => void start(i)} /> : <div className="h-14" aria-hidden />;
            }}
          />
        </>
      )}
    </div>
  );
}
