"use client";

import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import Link from "next/link";
import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { AlbumCard, Cover } from "@/library/LibraryScreen";
import { EmptyState } from "@/library/states";
import { player } from "@/player/player";
import { Carousel } from "./Carousel";
import { FeaturedBanner } from "./FeaturedBanner";
import { GenreTile } from "./GenreTile";

type Track = components["schemas"]["Track"];

const SECTION_LIMIT = 12;

function useLibraryTotal() {
  return useQuery({
    queryKey: ["tracks", "total"],
    retry: 1,
    retryDelay: 250,
    queryFn: async () => {
      const { data, response } = await api.GET("/api/v1/tracks", { params: { query: { limit: 1 } } });
      if (!data) throw new Error("Could not load your library.");
      const header = response.headers.get("X-Total-Count");
      return header === null ? data.length : Number(header);
    },
  });
}

function useFeatured() {
  return useQuery({
    queryKey: ["albums", "featured"],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/albums/featured");
      return data ?? null; // 204: nothing to feature yet
    },
  });
}

function useGenres() {
  return useQuery({
    queryKey: ["genres"],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/genres");
      if (!data) throw new Error("genres");
      return data;
    },
  });
}

function useRecentlyAdded() {
  return useQuery({
    queryKey: ["albums", "recent"],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/albums/recent", { params: { query: { limit: SECTION_LIMIT } } });
      if (!data) throw new Error("recent");
      return data;
    },
  });
}

function useMostPlayed() {
  return useQuery({
    queryKey: ["history", "most-played", SECTION_LIMIT],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/history/most-played", { params: { query: { limit: SECTION_LIMIT } } });
      if (!data) throw new Error("most played");
      return data;
    },
  });
}

export function ExploreScreen() {
  const total = useLibraryTotal();
  const featured = useFeatured();
  const genres = useGenres();
  const recent = useRecentlyAdded();
  const mostPlayed = useMostPlayed();

  const heading = (
    <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">Explore</h1>
  );

  if (total.isPending) {
    return (
      <div className="flex flex-col gap-8 py-8">
        {heading}
        <div role="status" aria-label="Loading Explore" className="flex flex-col gap-8 motion-safe:animate-pulse">
          <div className="h-[200px] rounded-banner bg-bg-subtle md:h-[280px]" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="aspect-square rounded-tile bg-bg-subtle md:aspect-video" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (total.isError) {
    return (
      <div className="flex flex-col gap-4 py-8">
        {heading}
        <p role="alert" className="text-danger">
          Could not load Explore.
        </p>
      </div>
    );
  }
  if (total.data === 0) {
    return (
      <div className="flex flex-col gap-4 py-8">
        {heading}
        <EmptyState kind="music" title="Nothing to explore yet" body="Upload some music and this page fills up with your albums, genres and favorites." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 py-8">
      {heading}
      {featured.data ? <FeaturedBanner album={featured.data} /> : null}

      {genres.data && genres.data.length > 0 ? (
        <section aria-labelledby="explore-genres" className="flex flex-col gap-3">
          <h2 id="explore-genres" className="font-display text-xl font-bold">
            Genres &amp; moods
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] md:gap-5">
            {genres.data.map((genre) => (
              <GenreTile key={genre.slug} genre={genre} />
            ))}
          </div>
        </section>
      ) : null}

      {recent.data && recent.data.length > 0 ? <Carousel title="Recently added" items={recent.data.map((album) => <AlbumCard key={album.id} album={album} />)} /> : null}

      {mostPlayed.data && mostPlayed.data.length > 0 ? (
        <Carousel
          title="Most played"
          items={mostPlayed.data.map(({ track, plays }, i) => (
            <TrackCard key={track.id} track={track} plays={plays} onPlay={() => void player.playList(mostPlayed.data.map((m) => m.track), i)} />
          ))}
        />
      ) : null}
    </div>
  );
}

function TrackCard({ track, plays, onPlay }: { track: Track; plays: number; onPlay: () => void }) {
  const body = (
    <>
      <Cover url={track.coverUrl} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{track.title}</span>
        <span className="block truncate text-[13px] text-fg-muted">
          {track.artist} · {plays} {plays === 1 ? "play" : "plays"}
        </span>
      </span>
    </>
  );
  return (
    <div className="group relative rounded-card p-2 hover:bg-surface-hover">
      {track.albumId ? (
        <Link href={`/albums/${track.albumId}`} className="flex flex-col gap-2">
          {body}
        </Link>
      ) : (
        <div className="flex flex-col gap-2">{body}</div>
      )}
      <button
        onClick={onPlay}
        aria-label={`Play ${track.title}`}
        className="absolute right-4 top-[calc(100%-5.75rem)] grid size-12 translate-y-2 place-items-center rounded-full bg-accent text-on-accent opacity-0 shadow-[var(--shadow-2)] transition duration-[180ms] ease-[var(--ease-out)] hover:bg-accent-hover focus-visible:translate-y-0 focus-visible:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100"
      >
        <Play size={20} aria-hidden fill="currentColor" />
      </button>
    </div>
  );
}
