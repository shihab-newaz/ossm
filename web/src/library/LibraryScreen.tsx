"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Disc3, Mic2, Play, Shuffle, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "@/components/ui/toast";
import { player } from "@/player/player";
import { fetchAllTracks, useAlbumPages, useArtistPages, useTrackPages, type Album, type Artist, type Sort, type Track } from "./data";
import { playAlbum } from "./playAlbum";
import { EmptyState, GridSkeleton, ListSkeleton } from "./states";
import { TrackRow } from "./TrackRow";
import { VirtualGrid } from "./VirtualGrid";

export { formatDuration } from "./TrackRow";

const TABS = [
  { id: "tracks", label: "Tracks" },
  { id: "albums", label: "Albums" },
  { id: "artists", label: "Artists" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const SORTS: { id: Sort; label: string }[] = [
  { id: "added", label: "Recently added" },
  { id: "title", label: "Title" },
  { id: "artist", label: "Artist" },
];

// The tab lives in the address (?tab=albums), so reloading and sharing the link keep it.
const tabListeners = new Set<() => void>();
function subscribeToTab(listener: () => void) {
  tabListeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    tabListeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}
function currentGenre(): string | null {
  return new URLSearchParams(window.location.search).get("genre");
}
function currentTab(): Tab {
  const wanted = new URLSearchParams(window.location.search).get("tab");
  return TABS.find((t) => t.id === wanted)?.id ?? "tracks";
}

export function LibraryScreen() {
  const tab = useSyncExternalStore(subscribeToTab, currentTab, () => "tracks" as Tab);
  const genre = useSyncExternalStore(subscribeToTab, currentGenre, () => null);
  function change(edit: (params: URLSearchParams) => void) {
    const url = new URL(window.location.href);
    edit(url.searchParams);
    window.history.replaceState(window.history.state, "", url);
    tabListeners.forEach((listener) => listener());
  }
  function choose(next: Tab) {
    change((p) => (next === "tracks" ? p.delete("tab") : p.set("tab", next)));
  }

  return (
    <div className="flex flex-col gap-6 py-8">
      <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">Library</h1>
      <div role="tablist" aria-label="Library sections" className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="library-panel"
            onClick={() => choose(t.id)}
            className={`h-9 rounded-full px-4 text-[14px] font-semibold ${tab === t.id ? "bg-fg text-bg" : "bg-surface-hover text-fg hover:bg-surface-active"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="library-panel" aria-labelledby={`tab-${tab}`} className="flex flex-col gap-6">
        {tab === "tracks" ? <TracksTab genre={genre ?? undefined} onClearGenre={() => change((p) => p.delete("genre"))} /> : tab === "albums" ? <AlbumsTab /> : <ArtistsTab />}
      </div>
    </div>
  );
}

/** Asks for the next page when the rows on screen are close to the end of what has loaded. */
function useLoadMore(loaded: number, query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown }) {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  return useCallback(
    (last: number) => {
      if (last >= loaded - 20 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
    },
    [loaded, hasNextPage, isFetchingNextPage, fetchNextPage],
  );
}

function SortSelect({ label, value, onChange }: { label: string; value: Sort; onChange: (sort: Sort) => void }) {
  return (
    <label className="ml-auto flex items-center gap-2 text-[13px] text-fg-muted">
      Sort by
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Sort)} className="h-9 rounded-full border border-border-strong bg-surface px-3 text-[14px] text-fg">
        {SORTS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LoadError({ what }: { what: string }) {
  return (
    <p role="alert" className="text-danger">
      Could not load your {what}.
    </p>
  );
}

function TracksTab({ genre, onClearGenre }: { genre?: string; onClearGenre: () => void }) {
  const client = useQueryClient();
  const [sort, setSort] = useState<Sort>("added");
  const { items, total, query } = useTrackPages(sort, genre);
  const nearEnd = useLoadMore(items.length, query);

  // Starting from a row plays the whole list in this order, which may be more than has loaded so far.
  async function start(index: number, opts?: { shuffle?: boolean; randomStart?: boolean }) {
    try {
      const tracks: Track[] = items.length >= total ? items : await fetchAllTracks(client, sort, genre);
      void player.playList(tracks, index, opts);
    } catch {
      toast.error("Could not load your library.");
    }
  }

  if (query.isPending) return <ListSkeleton />;
  if (query.isError) return <LoadError what="library" />;
  if (total === 0 && genre) {
    return (
      <div className="flex flex-col items-start gap-3 py-10">
        <h2 className="font-display text-xl font-bold">No tracks in that genre</h2>
        <button onClick={onClearGenre} className="text-accent hover:underline">
          Show the whole library
        </button>
      </div>
    );
  }
  if (total === 0) return <EmptyState kind="music" title="Your library is empty" body="Upload some music and it will show up here." />;
  return (
    <>
      {genre ? (
        <p className="flex items-center gap-2 text-[14px]">
          <span className="inline-flex h-8 items-center gap-1 rounded-full bg-fg pl-3.5 pr-1.5 font-semibold text-bg">
            Genre: {items[0]?.genre ?? genre}
            <button onClick={onClearGenre} aria-label="Clear the genre filter" className="grid size-6 place-items-center rounded-full hover:bg-white/20">
              <X size={14} aria-hidden />
            </button>
          </span>
        </p>
      ) : null}
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
        <SortSelect label="Sort tracks" value={sort} onChange={setSort} />
      </div>
      <VirtualGrid
        label="Tracks"
        count={total}
        rowHeight={56}
        onNearEnd={nearEnd}
        renderItem={(i) => {
          const track = items[i];
          return track ? <TrackRow key={track.id} track={track} details onPlay={() => void start(i)} /> : <div className="h-14" aria-hidden />;
        }}
      />
    </>
  );
}

function useColumns(): number {
  const [columns, setColumns] = useState(4);
  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth;
      setColumns(w < 640 ? 2 : w < 768 ? 3 : w < 1024 ? 4 : w < 1280 ? 5 : 6);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return columns;
}

function AlbumsTab() {
  const [sort, setSort] = useState<Sort>("added");
  const { items, total, query } = useAlbumPages(sort);
  const nearEnd = useLoadMore(items.length, query);
  const columns = useColumns();

  if (query.isPending) return <GridSkeleton label="Loading your albums" />;
  if (query.isError) return <LoadError what="albums" />;
  if (total === 0) return <EmptyState kind="album" title="No albums yet" body="Albums appear here once uploaded tracks have album tags." />;
  return (
    <>
      <div className="flex">
        <SortSelect label="Sort albums" value={sort} onChange={setSort} />
      </div>
      <VirtualGrid
        label="Albums"
        count={total}
        columns={columns}
        rowHeight={280}
        gap={16}
        onNearEnd={nearEnd}
        renderItem={(i) => (items[i] ? <AlbumCard key={items[i].id} album={items[i]} /> : <div className="aspect-square rounded-card bg-bg-subtle" aria-hidden />)}
      />
    </>
  );
}

export function Cover({ url, round, className = "" }: { url?: string; round?: boolean; className?: string }) {
  const shape = round ? "rounded-full" : "rounded-card";
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authenticated cover art
    <img src={url} alt="" loading="lazy" className={`aspect-square w-full object-cover ${shape} ${className}`} />
  ) : (
    <span aria-hidden className={`grid aspect-square w-full place-items-center bg-bg-subtle text-fg-subtle ${shape} ${className}`}>
      {round ? <Mic2 size={32} /> : <Disc3 size={32} />}
    </span>
  );
}

export function AlbumCard({ album }: { album: Album }) {
  const client = useQueryClient();
  return (
    <div className="group relative rounded-card p-2 hover:bg-surface-hover">
      <Link href={`/albums/${album.id}`} className="flex flex-col gap-2">
        <Cover url={album.coverUrl} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{album.title}</span>
          <span className="block truncate text-[13px] text-fg-muted">{[album.year, album.artist].filter(Boolean).join(" · ")}</span>
        </span>
      </Link>
      <button
        onClick={() => void playAlbum(client, album.id)}
        aria-label={`Play ${album.title}`}
        className="absolute right-4 top-[calc(100%-5.75rem)] grid size-12 translate-y-2 place-items-center rounded-full bg-accent text-on-accent opacity-0 shadow-[var(--shadow-2)] transition duration-[180ms] ease-[var(--ease-out)] hover:bg-accent-hover focus-visible:translate-y-0 focus-visible:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100"
      >
        <Play size={20} aria-hidden fill="currentColor" />
      </button>
    </div>
  );
}

function ArtistsTab() {
  const { items, total, query } = useArtistPages();
  const nearEnd = useLoadMore(items.length, query);

  if (query.isPending) return <ListSkeleton label="Loading your artists" />;
  if (query.isError) return <LoadError what="artists" />;
  if (total === 0) return <EmptyState kind="artist" title="No artists yet" body="Artists appear here once you have uploaded music." />;
  return (
    <VirtualGrid
      label="Artists"
      count={total}
      rowHeight={72}
      onNearEnd={nearEnd}
      renderItem={(i) => (items[i] ? <ArtistRow key={items[i].id} artist={items[i]} /> : <div className="h-[72px]" aria-hidden />)}
    />
  );
}

function ArtistRow({ artist }: { artist: Artist }) {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <Link href={`/artists/${artist.id}`} className="flex h-[72px] items-center gap-4 rounded-card px-2 hover:bg-surface-hover">
      <span className="size-14 shrink-0">
        <Cover url={artist.coverUrl} round />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{artist.name}</span>
        <span className="block truncate text-[13px] text-fg-muted">
          {count(artist.albumCount, "album", "albums")} · {count(artist.trackCount, "track", "tracks")}
        </span>
      </span>
    </Link>
  );
}
