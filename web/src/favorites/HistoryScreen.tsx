"use client";

import { History } from "lucide-react";
import Link from "next/link";
import { ListSkeleton } from "@/library/states";
import { TrackRow } from "@/library/TrackRow";
import { useLoadMore } from "@/library/LibraryScreen";
import { VirtualGrid } from "@/library/VirtualGrid";
import { player } from "@/player/player";
import { useHistoryPages } from "./data";

const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today, 2:32 PM", "Yesterday, 9:05 AM", or the date. */
export function whenPlayed(playedAt: string, now: Date = new Date()): string {
  const at = new Date(playedAt);
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return `Today, ${time.format(at)}`;
  if (days === 1) return `Yesterday, ${time.format(at)}`;
  return date.format(at);
}

/** What the user listened to, most recent first. A track heard twice is listed twice. */
export function HistoryScreen() {
  const { items, total, query } = useHistoryPages();
  const nearEnd = useLoadMore(items.length, query);
  // The queue is the tracks as listed, so Next goes to the play before the one chosen.
  const tracks = items.map((p) => p.track);

  return (
    <div className="flex flex-col gap-6 py-8">
      <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">History</h1>
      {query.isPending ? (
        <ListSkeleton label="Loading your history" />
      ) : query.isError ? (
        <p role="alert" className="text-danger">
          Could not load your history.
        </p>
      ) : total === 0 ? (
        <div className="flex flex-col items-start gap-3 py-10">
          <History size={64} aria-hidden strokeWidth={1.25} className="text-fg-subtle" />
          <h2 className="font-display text-xl font-bold">Nothing played yet</h2>
          <p className="text-fg-muted">Tracks you have listened to for a while are listed here, newest first.</p>
          <Link href="/library" className="grid h-10 place-items-center rounded-full border border-border-strong px-5 text-[15px] font-semibold hover:bg-surface-hover">
            Browse your library
          </Link>
        </div>
      ) : (
        <VirtualGrid
          label="Recently played"
          count={total}
          rowHeight={56}
          onNearEnd={nearEnd}
          renderItem={(i) => {
            const entry = items[i];
            // The same track can be listed many times, so the key is the play, not the track.
            return entry ? (
              <TrackRow key={`${entry.playedAt}-${i}`} track={entry.track} details meta={whenPlayed(entry.playedAt)} onPlay={() => void player.playList(tracks, i)} />
            ) : (
              <div className="h-14" aria-hidden />
            );
          }}
        />
      )}
    </div>
  );
}
