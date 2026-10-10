"use client";

import { Disc3, Mic2, Music, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { player } from "@/player/player";
import { isEmpty, topResult, useSearch, type SearchResults } from "./data";
import { searchPalette, useSearchPaletteOpen } from "./palette";
import { useDebouncedValue } from "./useDebouncedValue";

const PER_GROUP = 5;
const DEBOUNCE_MS = 200;

/** Search from anywhere (Ctrl/Cmd+K or "/"): a box, and the best few hits of each kind under it. */
export function SearchPalette() {
  const open = useSearchPaletteOpen();
  return (
    <Modal open={open} onClose={searchPalette.close} title="Search" variant="palette">
      <PaletteBody />
    </Modal>
  );
}

type Option = { id: string; label: string; icon: ReactNode; title: string; subtitle?: string; run: () => void };
type Section = { name: string; options: Option[] };

function PaletteBody() {
  const router = useRouter();
  const uid = useId();
  const [text, setText] = useState("");
  const query = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const search = useSearch(query, PER_GROUP);
  const results = query ? search.data : undefined;
  // Waiting on the pause in typing, or on the answer: what is showing is for an earlier query.
  const stale = text.trim() !== query || (query !== "" && search.isFetching);

  const go = (path: string) => {
    searchPalette.close();
    router.push(path);
  };

  const sections = results ? buildSections(results, query, uid, go) : [];
  const options = sections.flatMap((s) => s.options);

  // The highlight starts on the top option for every new answer, and is the user's after that.
  const [cursor, setCursor] = useState<{ for: unknown; index: number }>({ for: null, index: 0 });
  const index = cursor.for === results ? Math.min(cursor.index, Math.max(options.length - 1, 0)) : 0;
  const activeId = options[index]?.id;
  const move = (to: number) => setCursor({ for: results, index: (to + options.length) % options.length });

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (options.length > 0) move(index + (event.key === "ArrowDown" ? 1 : -1));
        break;
      case "Enter":
        event.preventDefault();
        options[index]?.run();
        break;
      case "Escape":
        // Clear first; with nothing to clear the key goes on to close the palette.
        if (text !== "") {
          event.stopPropagation();
          setText("");
        }
        break;
    }
  }

  return (
    <>
      <div className="relative">
        <Search size={20} aria-hidden className="pointer-events-none absolute left-4 top-3.5 text-fg-subtle" />
        <input
          role="combobox"
          aria-label="Search your library"
          aria-expanded={options.length > 0}
          aria-controls={`${uid}-list`}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search your library"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-12 w-full rounded-full bg-bg-subtle pl-11 pr-12 text-[16px] placeholder:text-fg-subtle focus:bg-surface focus:outline-2 focus:outline-offset-0 focus:outline-focus"
        />
        {text ? (
          <button
            onClick={() => setText("")}
            aria-label="Clear search"
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full text-fg-muted hover:bg-surface-active"
          >
            <X size={16} aria-hidden />
          </button>
        ) : null}
      </div>

      <div id={`${uid}-list`} role="listbox" aria-label="Results" className={`flex flex-col gap-2 overflow-y-auto ${stale ? "opacity-60" : ""}`}>
        {sections.map((section, i) => (
          <div key={section.name} role="group" aria-labelledby={`${uid}-heading-${i}`} className="flex flex-col">
            <h3 id={`${uid}-heading-${i}`} className="px-3 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
              {section.name}
            </h3>
            {section.options.map((option) => (
              <OptionRow key={option.id} option={option} active={option.id === activeId} onHover={() => setCursor({ for: results, index: options.indexOf(option) })} />
            ))}
          </div>
        ))}
      </div>

      <Status query={query} stale={stale} loading={search.isPending && query !== ""} failed={search.isError} empty={results ? isEmpty(results) : false} />
    </>
  );
}

function Status({ query, stale, loading, failed, empty }: { query: string; stale: boolean; loading: boolean; failed: boolean; empty: boolean }) {
  if (query === "" && !stale) return <p className="px-3 py-6 text-center text-fg-muted">Search your tracks, albums and artists</p>;
  if (failed) return <p className="px-3 py-6 text-center text-fg-muted">Search is not available right now. Try again in a moment.</p>;
  if (loading) return <div role="status" aria-label="Searching" className="mx-3 my-4 h-4 w-1/3 rounded bg-bg-subtle motion-safe:animate-pulse" />;
  if (empty && !stale) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="font-semibold">No matches for “{query}”</p>
        <p className="text-[13px] text-fg-muted">Check the spelling, or try fewer words.</p>
      </div>
    );
  }
  return null;
}

function OptionRow({ option, active, onHover }: { option: Option; active: boolean; onHover: () => void }) {
  return (
    <div
      id={option.id}
      role="option"
      aria-selected={active}
      aria-label={option.label}
      // Keep the focus in the box: a click should choose, not move the caret away.
      onMouseDown={(e) => e.preventDefault()}
      onMouseMove={onHover}
      onClick={option.run}
      className={`flex h-14 cursor-pointer items-center gap-3 rounded-card px-3 ${active ? "bg-surface-active" : ""}`}
    >
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-bg-subtle text-fg-muted">
        {option.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{option.title}</span>
        {option.subtitle ? <span className="block truncate text-[13px] text-fg-muted">{option.subtitle}</span> : null}
      </span>
    </div>
  );
}

/** The options in the order the arrows walk them: top result, tracks, albums, artists, then "See all". */
function buildSections(results: SearchResults, query: string, uid: string, go: (path: string) => void): Section[] {
  let n = 0;
  const id = () => `${uid}-option-${n++}`;
  const top = topResult(results);
  const topId = results.top?.id;

  const trackOption = (track: SearchResults["tracks"][number]): Option => ({
    id: id(),
    label: `${track.title}, track by ${track.artist}`,
    icon: <Music size={18} />,
    title: track.title,
    subtitle: [track.artist, track.album].filter(Boolean).join(" · "),
    // Plays the tracks found, from this one, so next goes to the next hit.
    run: () => {
      searchPalette.close();
      void player.playList(results.tracks, results.tracks.indexOf(track));
    },
  });
  const albumOption = (album: SearchResults["albums"][number]): Option => ({
    id: id(),
    label: `${album.title}, album by ${album.artist}`,
    icon: <Disc3 size={18} />,
    title: album.title,
    subtitle: [album.year, album.artist].filter(Boolean).join(" · "),
    run: () => go(`/albums/${album.id}`),
  });
  const artistOption = (artist: SearchResults["artists"][number]): Option => ({
    id: id(),
    label: `${artist.name}, artist`,
    icon: <Mic2 size={18} />,
    title: artist.name,
    subtitle: "Artist",
    run: () => go(`/artists/${artist.id}`),
  });

  const sections: Section[] = [];
  if (top?.item) {
    const option = top.kind === "track" ? trackOption(top.item as SearchResults["tracks"][number]) : top.kind === "album" ? albumOption(top.item as SearchResults["albums"][number]) : artistOption(top.item as SearchResults["artists"][number]);
    sections.push({ name: "Top result", options: [option] });
  }
  // The top result is already shown above; it is not listed a second time.
  const rest = <T extends { id: string }>(items: T[]) => items.filter((item) => item.id !== topId);
  const tracks = rest(results.tracks);
  const albums = rest(results.albums);
  const artists = rest(results.artists);
  if (tracks.length > 0) sections.push({ name: "Tracks", options: tracks.map(trackOption) });
  if (albums.length > 0) sections.push({ name: "Albums", options: albums.map(albumOption) });
  if (artists.length > 0) sections.push({ name: "Artists", options: artists.map(artistOption) });

  if (sections.length > 0) {
    sections.push({
      name: "More",
      options: [
        {
          id: id(),
          label: `See all results for “${query}”`,
          icon: <Search size={18} />,
          title: `See all results for “${query}”`,
          run: () => go(`/search?q=${encodeURIComponent(query)}`),
        },
      ],
    });
  }
  return sections;
}
