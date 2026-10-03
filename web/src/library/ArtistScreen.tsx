"use client";

import { Play, Shuffle } from "lucide-react";
import Link from "next/link";
import { player } from "@/player/player";
import { useArtist } from "./data";
import { AlbumCard, Cover } from "./LibraryScreen";
import { ListSkeleton } from "./states";
import { TrackRow } from "./TrackRow";

export function ArtistScreen({ id }: { id: string }) {
  const query = useArtist(id);
  if (query.isPending) {
    return (
      <div className="py-8">
        <ListSkeleton label="Loading the artist" />
      </div>
    );
  }
  if (query.isError) {
    return query.error.message === "not-found" ? (
      <div className="flex flex-col items-start gap-3 py-10">
        <h1 className="font-display text-xl font-bold">Artist not found</h1>
        <p className="text-fg-muted">They may have been removed, or the link is wrong.</p>
        <Link href="/library?tab=artists" className="text-accent hover:underline">
          Back to your artists
        </Link>
      </div>
    ) : (
      <p role="alert" className="py-8 text-danger">
        Could not load this artist.
      </p>
    );
  }

  const { artist, albums, tracks } = query.data;
  return (
    <div className="flex flex-col gap-8 py-8">
      <header className="flex flex-col items-center gap-6 md:flex-row md:items-end">
        <div className="w-40 shrink-0">
          <Cover url={artist.coverUrl} round />
        </div>
        <div className="flex min-w-0 flex-col gap-2 text-center md:text-left">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-fg-muted">Artist</p>
          <h1 className="font-display text-4xl font-extrabold leading-10 tracking-[-0.02em] md:text-[56px] md:leading-[60px]">{artist.name}</h1>
          <p className="text-[15px] text-fg-muted">
            {artist.albumCount} {artist.albumCount === 1 ? "album" : "albums"} · {artist.trackCount} {artist.trackCount === 1 ? "track" : "tracks"}
          </p>
        </div>
      </header>

      <div className="flex items-center gap-4">
        <button
          onClick={() => void player.playList(tracks, 0)}
          aria-label={`Play ${artist.name}`}
          className="grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--shadow-2)] hover:bg-accent-hover active:scale-[0.97]"
        >
          <Play size={24} aria-hidden fill="currentColor" />
        </button>
        <button
          onClick={() => void player.playList(tracks, 0, { shuffle: true, randomStart: true })}
          aria-label={`Shuffle ${artist.name}`}
          className="grid size-11 place-items-center rounded-full border border-border-strong hover:bg-surface-hover"
        >
          <Shuffle size={20} aria-hidden />
        </button>
      </div>

      {albums.length > 0 ? (
        <section aria-labelledby="artist-albums" className="flex flex-col gap-3">
          <h2 id="artist-albums" className="font-display text-xl font-bold">
            Albums
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="artist-tracks" className="flex flex-col gap-3">
        <h2 id="artist-tracks" className="font-display text-xl font-bold">
          Tracks
        </h2>
        <div role="list" aria-label="Tracks">
          {tracks.map((track, i) => (
            <TrackRow key={track.id} track={track} details onPlay={() => void player.playList(tracks, i)} />
          ))}
        </div>
      </section>
    </div>
  );
}
