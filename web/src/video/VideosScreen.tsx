"use client";

import { Clapperboard } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { VirtualGrid } from "@/library/VirtualGrid";
import { useMoviePages, useShowPages, type VideoSort } from "./data";
import { ShowCard, VideoCard } from "./VideoCard";

const TABS = [
  { id: "movies", label: "Movies" },
  { id: "shows", label: "Shows" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const SORTS: { id: VideoSort; label: string }[] = [
  { id: "added", label: "Recently added" },
  { id: "title", label: "A–Z" },
  { id: "year", label: "Year" },
];

// The tab lives in the address (?tab=shows), so reloading and sharing the link keep it.
const tabListeners = new Set<() => void>();
function subscribeToTab(listener: () => void) {
  tabListeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    tabListeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}
function currentTab(): Tab {
  return new URLSearchParams(window.location.search).get("tab") === "shows" ? "shows" : "movies";
}

const CARD_MIN = 260;
const GAP = 24;

/** As many 260px-or-wider cards as fit next to the sidebar (DESIGN.md auto-fill grid). */
function useCardColumns(): number {
  const [columns, setColumns] = useState(4);
  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth;
      const content = Math.min(1600, w - (w >= 1024 ? 240 : 0)) - (w >= 1024 ? 64 : w >= 768 ? 48 : 32);
      setColumns(Math.max(1, Math.floor((content + GAP) / (CARD_MIN + GAP))));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return columns;
}

/** Asks for the next page when the cards on screen near the end of what has loaded. */
function useLoadMore(loaded: number, query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown }) {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  return useCallback(
    (last: number) => {
      if (last >= loaded - 12 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
    },
    [loaded, hasNextPage, isFetchingNextPage, fetchNextPage],
  );
}

export function VideosScreen() {
  const tab = useSyncExternalStore(subscribeToTab, currentTab, () => "movies" as Tab);
  const [sort, setSort] = useState<VideoSort>("added");

  function choose(next: Tab) {
    const url = new URL(window.location.href);
    if (next === "movies") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
    tabListeners.forEach((listener) => listener());
  }

  return (
    <div className="flex flex-col gap-6 py-8">
      <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">Videos</h1>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border">
        <div role="tablist" aria-label="Video sections" className="flex gap-7">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`video-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="videos-panel"
              onClick={() => choose(t.id)}
              className="-mb-px border-b-2 border-transparent pb-3 text-[15px] font-semibold text-fg-muted hover:text-fg aria-selected:border-accent aria-selected:text-fg"
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Sort" className="flex gap-2 pb-2.5">
          {SORTS.map((s) => (
            <button
              key={s.id}
              aria-pressed={sort === s.id}
              onClick={() => setSort(s.id)}
              className="h-8 rounded-full bg-bg-subtle px-3.5 text-[13px] font-semibold hover:bg-surface-hover aria-pressed:bg-fg aria-pressed:text-bg"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" id="videos-panel" aria-labelledby={`video-tab-${tab}`} className="pt-2">
        {tab === "movies" ? <MoviesTab sort={sort} /> : <ShowsTab sort={sort} />}
      </div>
    </div>
  );
}

function MoviesTab({ sort }: { sort: VideoSort }) {
  const { items, total, query } = useMoviePages(sort);
  const nearEnd = useLoadMore(items.length, query);
  const columns = useCardColumns();

  if (query.isPending) return <VideoGridSkeleton label="Loading your movies" />;
  if (query.isError) return <LoadError what="movies" />;
  if (total === 0) return <VideosEmpty />;
  return (
    <VirtualGrid
      label="Movies"
      count={total}
      columns={columns}
      rowHeight={230}
      gap={GAP}
      onNearEnd={nearEnd}
      renderItem={(i) => (items[i] ? <VideoCard key={items[i].id} video={items[i]} /> : <CardPlaceholder />)}
    />
  );
}

function ShowsTab({ sort }: { sort: VideoSort }) {
  const { items, total, query } = useShowPages(sort);
  const nearEnd = useLoadMore(items.length, query);
  const columns = useCardColumns();

  if (query.isPending) return <VideoGridSkeleton label="Loading your shows" />;
  if (query.isError) return <LoadError what="shows" />;
  if (total === 0) return <VideosEmpty title="No shows yet" body="Episodes named like Show.Name.S01E02.mkv are grouped into shows as they upload." />;
  return (
    <VirtualGrid
      label="Shows"
      count={total}
      columns={columns}
      rowHeight={230}
      gap={GAP}
      onNearEnd={nearEnd}
      renderItem={(i) => (items[i] ? <ShowCard key={items[i].id} show={items[i]} /> : <CardPlaceholder />)}
    />
  );
}

function CardPlaceholder() {
  return <div aria-hidden className="aspect-video rounded-card bg-surface-hover" />;
}

function LoadError({ what }: { what: string }) {
  return (
    <p role="alert" className="text-danger">
      Could not load your {what}.
    </p>
  );
}

/** Skeleton cards in 16:9, never a spinner (DESIGN.md 4.11). */
export function VideoGridSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-6 gap-y-8 motion-safe:animate-pulse">
      {Array.from({ length: 8 }, (_, n) => (
        <div key={n} className="flex flex-col gap-3">
          <div className="aspect-video rounded-card bg-surface-hover" />
          <div className="flex flex-col gap-2 px-0.5">
            <div className="h-3.5 w-[70%] rounded bg-surface-hover" />
            <div className="h-3 w-[40%] rounded bg-surface-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function VideosEmpty({ title = "No videos yet", body = "Upload movies, shows or home videos and they'll show up here." }: { title?: string; body?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
      <Clapperboard size={64} strokeWidth={1.5} aria-hidden className="mb-2 text-fg-subtle" />
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <p className="text-fg-muted">{body}</p>
      <Link
        href="/upload"
        className="mt-3 flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent hover:bg-accent-hover active:scale-[0.97]"
      >
        Upload videos
      </Link>
    </div>
  );
}
