"use client";

import Link from "next/link";
import { Play, Shuffle } from "lucide-react";
import { player } from "@/player/player";
import { Cover } from "./LibraryScreen";
import { useAlbum, type Track } from "./data";
import { LicenseChip } from "./LicenseChip";
import { QualityBadge } from "./QualityBadge";
import { quality } from "./quality";
import { ListSkeleton } from "./states";
import { TrackRow } from "./TrackRow";
import { washColor } from "./wash";

export function formatTotal(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

/** A fixed locale and zone, so the same upload always shows the same date. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** The distinct values of something across tracks, in first-seen order. */
function distinct<T>(tracks: Track[], pick: (t: Track) => T | null): T[] {
  return [...new Set(tracks.map(pick).filter((v): v is T => v !== null))];
}

export function AlbumScreen({ id }: { id: string }) {
  const query = useAlbum(id);
  if (query.isPending) return <div className="py-8"><ListSkeleton label="Loading the album" /></div>;
  if (query.isError) {
    return query.error.message === "not-found" ? (
      <div className="flex flex-col items-start gap-3 py-10">
        <h1 className="font-display text-xl font-bold">Album not found</h1>
        <p className="text-fg-muted">It may have been removed, or the link is wrong.</p>
        <Link href="/library?tab=albums" className="text-accent hover:underline">Back to your albums</Link>
      </div>
    ) : (
      <p role="alert" className="py-8 text-danger">Could not load this album.</p>
    );
  }

  const { album, tracks, uploadedBy, uploadedAt } = query.data;
  const wash = washColor(album.dominantColor);
  const qualities = distinct(tracks, (t) => quality(t.codec, t.bitrateKbps)?.label ?? null);
  const licenses = distinct(tracks, (t) => t.license);
  const lead = (shuffle: boolean) => () => void player.playList(tracks, 0, shuffle ? { shuffle: true, randomStart: true } : undefined);

  return (
    <div className="-mx-4 md:-mx-6 lg:-mx-8">
      <header
        // The colour is clamped (wash.ts) so white text on it is always at least 4.5:1.
        style={wash ? { backgroundColor: wash } : undefined}
        className={`flex flex-col items-center gap-6 px-4 pb-6 pt-8 md:flex-row md:items-end md:px-6 lg:px-8 ${wash ? "text-white" : "bg-bg-subtle"}`}
        data-testid="album-header"
      >
        <div className="w-[232px] shrink-0 overflow-hidden rounded-card shadow-[var(--shadow-3)]">
          <Cover url={album.coverUrl} />
        </div>
        <div className="flex min-w-0 flex-col gap-2 text-center md:text-left">
          <p className="text-[13px] font-semibold uppercase tracking-wider opacity-80">Album</p>
          <h1 className="font-display text-4xl font-extrabold leading-10 tracking-[-0.02em] md:text-[56px] md:leading-[60px]">{album.title}</h1>
          <p className="text-[15px]">
            <Link href={`/artists/${album.artistId}`} className="font-semibold hover:underline">
              {album.artist}
            </Link>
            {album.year ? ` · ${album.year}` : ""} · {album.trackCount} {album.trackCount === 1 ? "song" : "songs"}, {formatTotal(album.durationMs)}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <button
            onClick={lead(false)}
            aria-label={`Play ${album.title}`}
            className="grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--shadow-2)] hover:bg-accent-hover active:scale-[0.97]"
          >
            <Play size={24} aria-hidden fill="currentColor" />
          </button>
          <button
            onClick={lead(true)}
            aria-label={`Shuffle ${album.title}`}
            className="grid size-11 place-items-center rounded-full border border-border-strong hover:bg-surface-hover"
          >
            <Shuffle size={20} aria-hidden />
          </button>
        </div>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[12px] text-fg-muted">
          {qualities.map((label) => {
            const t = tracks.find((x) => quality(x.codec, x.bitrateKbps)?.label === label)!;
            return <QualityBadge key={label} codec={t.codec} bitrateKbps={t.bitrateKbps} />;
          })}
          {licenses.map((license) => (
            <LicenseChip key={license} license={license} />
          ))}
          <span>
            Uploaded by @{uploadedBy} · {formatDate(uploadedAt)}
          </span>
        </p>

        <div role="list" aria-label="Tracks">
          {tracks.map((track, i) => (
            <TrackRow key={track.id} track={track} number={i + 1} details onPlay={() => void player.playList(tracks, i)} />
          ))}
        </div>
      </div>
    </div>
  );
}
