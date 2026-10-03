"use client";

import { useQuery } from "@tanstack/react-query";
import { Music } from "lucide-react";
import Link from "next/link";
import { api } from "@/api/client";
import type { components } from "@/api/schema";

type Track = components["schemas"]["Track"];

function useTracks() {
  return useQuery({
    queryKey: ["tracks"],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/tracks");
      if (!data) throw new Error("Could not load your library.");
      return data;
    },
  });
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function LibraryScreen() {
  const tracks = useTracks();
  return (
    <div className="flex flex-col gap-6 py-8">
      <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">Library</h1>
      {tracks.isPending ? <Skeleton /> : null}
      {tracks.isError ? (
        <p role="alert" className="text-danger">
          Could not load your library.
        </p>
      ) : null}
      {tracks.data && tracks.data.length === 0 ? <Empty /> : null}
      {tracks.data && tracks.data.length > 0 ? (
        <ul aria-label="Tracks" className="flex flex-col">
          {tracks.data.map((track) => (
            <TrackRow key={track.id} track={track} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TrackRow({ track }: { track: Track }) {
  return (
    <li className="flex items-center gap-4 rounded-card px-2 py-2 hover:bg-surface-hover">
      {track.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authenticated cover art
        <img src={track.coverUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-bg-subtle text-fg-subtle">
          <Music size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{track.title}</p>
        <p className="truncate text-[13px] text-fg-muted">
          {track.artist}
          {track.album ? ` · ${track.album}` : ""}
        </p>
      </div>
      <span className="font-mono text-[12px] text-fg-muted">{formatDuration(track.durationMs)}</span>
    </li>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-label="Loading your library" className="flex flex-col gap-3">
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

function Empty() {
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <Music size={64} aria-hidden strokeWidth={1.25} className="text-fg-subtle" />
      <h2 className="font-display text-xl font-bold">Your library is empty</h2>
      <p className="text-fg-muted">Upload some music and it will show up here.</p>
      <Link href="/upload" className="grid h-10 place-items-center rounded-full border border-border-strong px-5 text-[15px] font-semibold hover:bg-surface-hover">
        Upload music
      </Link>
    </div>
  );
}
