import Link from "next/link";
import { formatTime } from "@/player/format";
import { MetaBadge } from "./badges";
import type { Video } from "./data";
import { episodeRowTitle, progressPercent, videoQuality } from "./format";
import { Thumb } from "./Thumb";

type Props = {
  video: Video;
  /** The line under the title. Defaults to the episode's description. */
  description?: string;
  /** Highlights the row as the one to watch next. */
  upNext?: boolean;
  /** Narrow rows (the watch page's side list, phones) drop the quality badge and use a 120px thumbnail. */
  compact?: boolean;
};

/** One episode in a season list, or one video in an "Up next" list. Opens the watch page. */
export function EpisodeRow({ video, description, upNext, compact }: Props) {
  const quality = compact ? null : videoQuality(video);
  const title = video.kind === "EPISODE" ? episodeRowTitle(video) : video.title;
  const line = description ?? video.description ?? "";
  return (
    <Link
      href={`/watch/${video.id}`}
      aria-current={upNext ? "true" : undefined}
      className={`group flex min-w-0 items-center gap-4 rounded-card p-2 transition-colors duration-150 hover:bg-surface-hover focus-visible:bg-surface-hover ${upNext ? "bg-bg-subtle" : ""}`}
    >
      <span className={compact ? "w-[120px] shrink-0" : "w-[120px] shrink-0 sm:w-40"}>
        <Thumb src={video.thumbnailUrl} radius="row" duration={formatTime(video.durationMs / 1000)} progress={progressPercent(video)} watched={video.progress?.watched} hover="center" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {upNext ? <span className="text-[12px] font-semibold uppercase leading-4 tracking-[0.06em]">Up next</span> : null}
        <span className="truncate text-[15px] font-semibold leading-5">{title}</span>
        {line ? <span className="truncate text-[13px] leading-[18px] text-fg-muted">{line}</span> : null}
      </span>
      {quality ? (
        <span className="mr-2 hidden shrink-0 md:inline-flex">
          <MetaBadge>{quality}</MetaBadge>
        </span>
      ) : null}
    </Link>
  );
}
