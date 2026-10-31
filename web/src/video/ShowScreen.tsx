"use client";

import { Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { tileColor } from "@/explore/genreColor";
import { ListSkeleton } from "@/library/states";
import { useShow, type ShowDetail, type Video } from "./data";
import { episodeCode, showCounts } from "./format";
import { EpisodeRow } from "./EpisodeRow";
import { Thumb } from "./Thumb";

/** The same rule as genre slugs, so a show keeps its colour wherever it appears. */
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** What the play button starts: the episode to resume, or the very first one. */
function startingEpisode(detail: ShowDetail): Video | undefined {
  return detail.resume ?? detail.seasons[0]?.episodes[0];
}

export function ShowScreen({ id }: { id: string }) {
  const query = useShow(id);
  const [chosenSeason, setChosenSeason] = useState<number | null>(null);

  if (query.isPending) return <div className="py-8"><ListSkeleton label="Loading the show" /></div>;
  if (query.isError) {
    return query.error.message === "not-found" ? (
      <div className="flex flex-col items-start gap-3 py-10">
        <h1 className="font-display text-xl font-bold">Show not found</h1>
        <p className="text-fg-muted">It may have been removed, or the link is wrong.</p>
        <Link href="/videos?tab=shows" className="text-accent hover:underline">Back to your shows</Link>
      </div>
    ) : (
      <p role="alert" className="py-8 text-danger">Could not load this show.</p>
    );
  }

  const detail = query.data;
  const { show, seasons, uploadedBy } = detail;
  const start = startingEpisode(detail);
  // Open on the season of the episode to watch next, so it is one glance away.
  const season = seasons.find((s) => s.number === chosenSeason) ?? seasons.find((s) => s.number === detail.resume?.season) ?? seasons[0];
  const wash = `linear-gradient(180deg, color-mix(in srgb, ${tileColor(slug(show.name))} 55%, transparent) 0%, var(--bg) 100%)`;

  return (
    <div className="-mx-4 md:-mx-6 lg:-mx-8">
      <header style={{ backgroundImage: wash }} className="flex flex-col items-start gap-6 px-4 pb-2 pt-10 md:min-h-[256px] md:flex-row md:items-end md:gap-8 md:px-6 lg:px-8" data-testid="show-header">
        <div className="w-full max-w-[360px] shrink-0">
          <Thumb src={show.thumbnailUrl} shadow />
        </div>
        <div className="flex min-w-0 flex-col gap-2 pb-1">
          <p className="text-[12px] font-semibold uppercase leading-4 tracking-[0.06em]">Show</p>
          <h1 className="font-display text-4xl font-extrabold leading-10 tracking-[-0.02em] md:text-[56px] md:leading-[60px]">{show.name}</h1>
          <p className="font-mono text-[12px] font-medium leading-4 text-fg-muted">
            {showCounts(show.seasonCount, show.episodeCount)} · Uploaded by @{uploadedBy}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-8 px-4 pt-6 md:px-6 lg:px-8">
        {start ? (
          <Link href={`/watch/${start.id}`} className="group flex items-center gap-3 self-start rounded-full">
            <span className="grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--shadow-2)] group-hover:bg-accent-hover group-active:scale-[0.97]">
              <Play size={26} aria-hidden fill="currentColor" />
            </span>
            <span className="text-[15px] font-semibold">{detail.resume ? `Resume ${episodeCode(start)}` : `Play ${episodeCode(start)}`}</span>
          </Link>
        ) : null}

        {seasons.length > 0 ? (
          <div className="flex flex-col gap-4">
            <div role="tablist" aria-label="Seasons" className="flex gap-7 overflow-x-auto border-b border-border [scrollbar-width:none]">
              {seasons.map((s) => (
                <button
                  key={s.number}
                  role="tab"
                  id={`season-tab-${s.number}`}
                  aria-selected={s.number === season?.number}
                  aria-controls="season-panel"
                  onClick={() => setChosenSeason(s.number)}
                  className="-mb-px shrink-0 border-b-2 border-transparent pb-3 text-[15px] font-semibold text-fg-muted hover:text-fg aria-selected:border-accent aria-selected:text-fg"
                >
                  Season {s.number}
                </button>
              ))}
            </div>
            {season ? (
              <div role="tabpanel" id="season-panel" aria-labelledby={`season-tab-${season.number}`} className="-mx-2 flex flex-col gap-1">
                <ul aria-label={`Season ${season.number} episodes`} className="flex flex-col gap-1">
                  {season.episodes.map((episode) => (
                    <li key={episode.id}>
                      <EpisodeRow video={episode} upNext={episode.id === detail.resume?.id} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-fg-muted">This show has no episodes yet.</p>
        )}
      </div>
    </div>
  );
}
