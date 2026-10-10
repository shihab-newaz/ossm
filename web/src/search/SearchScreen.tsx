"use client";

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlbumCard, ArtistRow } from "@/library/LibraryScreen";
import { TrackRow } from "@/library/TrackRow";
import { ListSkeleton } from "@/library/states";
import { player } from "@/player/player";
import { isEmpty, topResult, useSearch, type SearchResults } from "./data";
import { useDebouncedValue } from "./useDebouncedValue";

const PER_GROUP = 30;
const DEBOUNCE_MS = 250;

/** Everything that matches, group by group. The address holds the query, so it can be shared and survives a reload. */
export function SearchScreen() {
  const router = useRouter();
  const urlQuery = (useSearchParams().get("q") ?? "").trim();
  const [text, setText] = useState(urlQuery);
  const typed = useDebouncedValue(text.trim(), DEBOUNCE_MS);

  // The address can change under a screen that stays mounted: the palette's "See all", Back, Forward.
  // The box follows it, unless the address is only catching up with what was typed.
  const [seen, setSeen] = useState(urlQuery);
  if (seen !== urlQuery) {
    setSeen(urlQuery);
    if (urlQuery !== typed) setText(urlQuery);
  }

  // Typing updates the address once there is a pause; the address drives the search.
  useEffect(() => {
    if (typed !== urlQuery) router.replace(typed ? `/search?q=${encodeURIComponent(typed)}` : "/search");
    // Only a pause in typing should move the address; following it back here would fight the keyboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const search = useSearch(urlQuery, PER_GROUP);

  return (
    <div className="flex flex-col gap-6 py-4">
      <h1 className="sr-only">Search</h1>
      <div role="search" className="relative w-full max-w-[560px]">
        <Search size={20} aria-hidden className="pointer-events-none absolute left-4 top-3 text-fg-subtle" />
        <input
          type="search"
          aria-label="Search your library"
          placeholder="Search your library"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && text) {
              e.preventDefault();
              setText("");
            }
          }}
          className="h-11 w-full rounded-full bg-bg-subtle pl-11 pr-11 text-[15px] placeholder:text-fg-subtle focus:bg-surface focus:outline-2 focus:outline-offset-0 focus:outline-focus [&::-webkit-search-cancel-button]:hidden"
        />
        {text ? (
          <button onClick={() => setText("")} aria-label="Clear search" className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full text-fg-muted hover:bg-surface-active">
            <X size={16} aria-hidden />
          </button>
        ) : null}
      </div>

      {urlQuery === "" ? (
        <p className="py-10 text-fg-muted">Search your tracks, albums and artists</p>
      ) : search.isPending ? (
        <ListSkeleton label="Searching" />
      ) : search.isError ? (
        <p className="py-10 text-fg-muted">Search is not available right now. Try again in a moment.</p>
      ) : isEmpty(search.data) ? (
        <div className="py-10">
          <p className="font-display text-xl font-bold">No matches for “{urlQuery}”</p>
          <p className="text-fg-muted">Check the spelling, or try fewer words.</p>
        </div>
      ) : (
        <Results results={search.data} />
      )}
    </div>
  );
}

function Results({ results }: { results: SearchResults }) {
  const top = topResult(results);
  const playTracks = (index: number) => void player.playList(results.tracks, index);
  return (
    <>
      {top?.item ? (
        <section aria-labelledby="top-result" className="flex flex-col gap-2">
          <h2 id="top-result" className="font-display text-xl font-bold">
            Top result
          </h2>
          {top.kind === "track" ? (
            <div role="list">
              <TrackRow track={top.item as SearchResults["tracks"][number]} details onPlay={() => playTracks(results.tracks.findIndex((t) => t.id === results.top?.id))} />
            </div>
          ) : top.kind === "album" ? (
            <div className="w-48">
              <AlbumCard album={top.item as SearchResults["albums"][number]} />
            </div>
          ) : (
            <ArtistRow artist={top.item as SearchResults["artists"][number]} />
          )}
        </section>
      ) : null}

      {results.tracks.length > 0 ? (
        <section aria-labelledby="tracks" className="flex flex-col gap-2">
          <h2 id="tracks" className="font-display text-xl font-bold">
            Tracks
          </h2>
          <div role="list">
            {results.tracks.map((track, i) => (
              <TrackRow key={track.id} track={track} details onPlay={() => playTracks(i)} />
            ))}
          </div>
        </section>
      ) : null}

      {results.albums.length > 0 ? (
        <section aria-labelledby="albums" className="flex flex-col gap-2">
          <h2 id="albums" className="font-display text-xl font-bold">
            Albums
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {results.albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </section>
      ) : null}

      {results.artists.length > 0 ? (
        <section aria-labelledby="artists" className="flex flex-col gap-2">
          <h2 id="artists" className="font-display text-xl font-bold">
            Artists
          </h2>
          <div>
            {results.artists.map((artist) => (
              <ArtistRow key={artist.id} artist={artist} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
