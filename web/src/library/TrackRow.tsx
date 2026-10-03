"use client";

import { ListEnd, ListPlus, Music, Play } from "lucide-react";
import Link from "next/link";
import type { components } from "@/api/schema";
import { Equalizer } from "@/components/ui/Equalizer";
import { toast } from "@/components/ui/toast";
import { player, usePlayer } from "@/player/player";
import { QualityBadge } from "./QualityBadge";

type Track = components["schemas"]["Track"];

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

type Props = {
  track: Track;
  /** Starts playback of the list this row is in, from this row. */
  onPlay: () => void;
  /** Shows this position instead of cover art, as album pages do. */
  number?: number;
  /** Show the album and the quality badge columns (wide screens only). */
  details?: boolean;
};

/** One 56px row in a track list: play, what it is, row actions and its length. */
export function TrackRow({ track, onPlay, number, details = false }: Props) {
  const { track: current, status } = usePlayer();
  const isCurrent = current?.id === track.id;
  const playing = isCurrent && (status === "playing" || status === "loading");
  const toggle = () => (isCurrent ? void player.toggle() : onPlay());
  return (
    <div role="listitem" className="group flex h-14 items-center gap-4 rounded-card px-2 hover:bg-surface-hover">
      <button
        // The row starts the whole list from here; on the track that is already loaded it just pauses or resumes.
        onClick={toggle}
        aria-label={`${playing ? "Pause" : "Play"} ${track.title}`}
        className={number === undefined ? "relative size-10 shrink-0 overflow-hidden rounded-lg" : "grid size-10 shrink-0 place-items-center rounded-lg font-mono text-[13px] text-fg-muted"}
      >
        {number === undefined ? (
          <>
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
              {isCurrent ? <Equalizer playing={playing} /> : <Play size={18} fill="currentColor" />}
            </span>
          </>
        ) : isCurrent ? (
          <Equalizer playing={playing} />
        ) : (
          <>
            <span aria-hidden className="group-hover:hidden group-focus-within:hidden">
              {number}
            </span>
            <Play aria-hidden size={16} fill="currentColor" className="hidden text-fg group-hover:block group-focus-within:block" />
          </>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${isCurrent ? "text-accent" : ""}`}>{track.title}</p>
        <p className="truncate text-[13px] text-fg-muted">
          <Link href={`/artists/${track.artistId}`} className="hover:underline">
            {track.artist}
          </Link>
          {number === undefined && track.album ? ` · ${track.album}` : ""}
        </p>
      </div>
      {details ? (
        <>
          <span className="hidden w-48 truncate text-[13px] text-fg-muted lg:block">
            {track.albumId ? (
              <Link href={`/albums/${track.albumId}`} className="hover:underline">
                {track.album}
              </Link>
            ) : null}
          </span>
          <span className="hidden w-24 md:block">
            <QualityBadge codec={track.codec} bitrateKbps={track.bitrateKbps} />
          </span>
        </>
      ) : null}
      <div className="flex shrink-0 items-center md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
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
      <span className="w-10 text-right font-mono text-[12px] text-fg-muted">{formatDuration(track.durationMs)}</span>
    </div>
  );
}
