import Link from "next/link";
import { formatTime } from "@/player/format";
import type { Show, Video } from "./data";
import { cardSubtitle, cardTitle, progressPercent, showCounts } from "./format";
import { Thumb } from "./Thumb";

function CardLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="group -m-2 flex min-w-0 flex-col gap-3 rounded-tile p-2 transition-colors duration-150 hover:bg-surface-hover focus-visible:bg-surface-hover"
    >
      {children}
    </Link>
  );
}

function Lines({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
      <span className="truncate text-[15px] font-semibold leading-5">{title}</span>
      <span className="truncate text-[13px] leading-[18px] text-fg-muted">{subtitle}</span>
    </span>
  );
}

/** A movie or episode: its thumbnail, title and one line under it. Opens the watch page. */
export function VideoCard({ video }: { video: Video }) {
  const title = cardTitle(video);
  const subtitle = cardSubtitle(video);
  return (
    <CardLink href={`/watch/${video.id}`} label={`${title}, ${subtitle}`}>
      <Thumb
        src={video.thumbnailUrl}
        duration={formatTime(video.durationMs / 1000)}
        progress={progressPercent(video)}
        watched={video.progress?.watched}
        warn={!video.playable}
        hover="fab"
      />
      <Lines title={title} subtitle={subtitle} />
    </CardLink>
  );
}

/** A show: its latest episode's thumbnail with the name on it. Opens the show page. */
export function ShowCard({ show }: { show: Show }) {
  const counts = showCounts(show.seasonCount, show.episodeCount);
  const progress = show.progress && !show.progress.watched && show.progress.durationMs > 0 ? Math.max(1, Math.round((show.progress.positionMs / show.progress.durationMs) * 100)) : 0;
  return (
    <CardLink href={`/videos/shows/${show.id}`} label={`${show.name}, ${counts}`}>
      <Thumb src={show.thumbnailUrl} label={show.name} progress={progress} hover="fab" />
      <Lines title={show.name} subtitle={counts} />
    </CardLink>
  );
}
