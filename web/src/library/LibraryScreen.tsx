"use client";

import { useQuery } from "@tanstack/react-query";
import { ListEnd, ListPlus, Music, Pause, Play, Shuffle } from "lucide-react";
import Link from "next/link";
import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { toast } from "@/components/ui/toast";
import { player, usePlayer } from "@/player/player";

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
        <>
          <div className="flex gap-2">
            <button
              onClick={() => void player.playList(tracks.data, 0)}
              className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent hover:bg-accent-hover active:scale-[0.97]"
            >
              <Play size={18} aria-hidden fill="currentColor" />
              Play all
            </button>
            <button
              onClick={() => void player.playList(tracks.data, 0, { shuffle: true, randomStart: true })}
              className="flex h-11 items-center gap-2 rounded-full border border-border-strong px-5 text-[15px] font-semibold hover:bg-surface-hover"
            >
              <Shuffle size={18} aria-hidden />
              Shuffle all
            </button>
          </div>
          <ul aria-label="Tracks" className="flex flex-col">
            {tracks.data.map((track, i) => (
              <TrackRow key={track.id} track={track} onPlay={() => void player.playList(tracks.data, i)} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function TrackRow({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const { track: current, status } = usePlayer();
  const isCurrent = current?.id === track.id;
  const playing = isCurrent && (status === "playing" || status === "loading");
  return (
    <li className="group flex items-center gap-4 rounded-card px-2 py-2 hover:bg-surface-hover">
      <button
        // The row starts the whole list from here; on the track that is already loaded it just pauses or resumes.
        onClick={() => (isCurrent ? void player.toggle() : onPlay())}
        aria-label={`${playing ? "Pause" : "Play"} ${track.title}`}
        className="relative size-10 shrink-0 overflow-hidden rounded-lg"
      >
        {track.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authenticated cover art
          <img src={track.coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <span aria-hidden className="grid size-full place-items-center bg-bg-subtle text-fg-subtle">
            <Music size={18} />
          </span>
        )}
        <span
          aria-hidden
          className={`absolute inset-0 grid place-items-center bg-black/45 text-white ${isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}
        >
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${isCurrent ? "text-accent" : ""}`}>{track.title}</p>
        <p className="truncate text-[13px] text-fg-muted">
          {track.artist}
          {track.album ? ` · ${track.album}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <button
          onClick={() => {
            void player.playNext(track);
            toast.info(`“${track.title}” will play next`);
          }}
          aria-label={`Play ${track.title} next`}
          className="grid size-9 place-items-center rounded-full text-fg-muted hover:bg-surface-active"
        >
          <ListPlus size={18} aria-hidden />
        </button>
        <button
          onClick={() => {
            void player.enqueue(track);
            toast.info(`Added “${track.title}” to the queue`);
          }}
          aria-label={`Add ${track.title} to queue`}
          className="grid size-9 place-items-center rounded-full text-fg-muted hover:bg-surface-active"
        >
          <ListEnd size={18} aria-hidden />
        </button>
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
