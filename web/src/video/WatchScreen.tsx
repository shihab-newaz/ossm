"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForcedDarkTheme } from "@/components/shell/ThemeSwitcher";
import { toast } from "@/components/ui/toast";
import { Carousel } from "@/explore/Carousel";
import { formatDate } from "@/library/AlbumScreen";
import { LicenseChip } from "@/library/LicenseChip";
import { MayNotPlayBadge, MetaBadge } from "./badges";
import { useAddSubtitle, useVideo, type Subtitle, type Video } from "./data";
import { EditDetailsDialog } from "./EditDetailsDialog";
import { EpisodeRow } from "./EpisodeRow";
import { longDuration, videoQuality } from "./format";
import { VideoCard } from "./VideoCard";
import { CannotPlay, VideoPlayer } from "./VideoPlayer";

export function WatchScreen({ id }: { id: string }) {
  useForcedDarkTheme();
  const query = useVideo(id);

  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading the video" className="flex flex-col gap-6 py-2 motion-safe:animate-pulse">
        <div className="-mx-4 aspect-video bg-surface md:-mx-6 lg:mx-0 lg:rounded-card" />
        <div className="h-9 w-1/3 rounded bg-surface" />
        <div className="h-4 w-1/5 rounded bg-surface" />
      </div>
    );
  }
  if (query.isError) {
    return query.error.message === "not-found" ? (
      <div className="flex flex-col items-start gap-3 py-10">
        <h1 className="font-display text-xl font-bold">Video not found</h1>
        <p className="text-fg-muted">It may have been removed, or the link is wrong.</p>
        <Link href="/videos" className="text-accent hover:underline">Back to your videos</Link>
      </div>
    ) : (
      <p role="alert" className="py-8 text-danger">Could not load this video.</p>
    );
  }
  // A new video is a new player: its own element, position and progress reporter.
  return <Watch key={query.data.video.id} {...query.data} />;
}

function Watch({ video, subtitles, upNext, canEdit }: { video: Video; subtitles: Subtitle[]; upNext: Video[]; canEdit: boolean }) {
  const router = useRouter();
  const addSubtitle = useAddSubtitle(video.id);
  const [tryAnyway, setTryAnyway] = useState(false);
  const [editing, setEditing] = useState(false);
  const episode = video.kind === "EPISODE";
  const next = episode ? upNext[0] : undefined;
  const quality = videoQuality(video);

  function onAddSubtitle(file: File) {
    addSubtitle.mutate(file, {
      onSuccess: (s) => toast.info(`${s.label} subtitles added.`),
      onError: (e) => toast.error(e.message),
    });
  }

  const player =
    !video.playable && !tryAnyway ? (
      <CannotPlay video={video} onTry={() => setTryAnyway(true)} />
    ) : (
      <VideoPlayer video={video} subtitles={subtitles} next={next} onNext={(n) => router.push(`/watch/${n.id}`)} onAddSubtitle={canEdit ? onAddSubtitle : undefined} />
    );

  const details = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">{video.title}</h1>
        <p className="text-fg-muted">
          {episode ? (
            <>
              {video.showId ? (
                <Link href={`/videos/shows/${video.showId}`} className="font-semibold text-fg underline underline-offset-[3px] hover:text-accent">
                  {video.showName}
                </Link>
              ) : (
                video.showName
              )}
              {[video.season != null ? `Season ${video.season}` : null, video.episode != null ? `Episode ${video.episode}` : null, longDuration(video.durationMs)]
                .filter(Boolean)
                .map((part) => ` · ${part}`)
                .join("")}
            </>
          ) : (
            [video.year, longDuration(video.durationMs)].filter(Boolean).join(" · ")
          )}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          {quality ? <MetaBadge>{quality}</MetaBadge> : null}
          {!video.playable ? <MayNotPlayBadge /> : null}
          {!video.playable && video.container ? <MetaBadge>{video.container.toUpperCase()}</MetaBadge> : null}
          <LicenseChip license={video.license} />
          <span className="ml-1 font-mono text-[12px] font-medium text-fg-muted">
            Uploaded by @{video.uploadedBy} · {formatDate(video.createdAt)}
          </span>
        </p>
      </div>
      {canEdit ? (
        <button onClick={() => setEditing(true)} className="h-10 shrink-0 self-start rounded-full border border-border-strong px-4 text-[15px] font-semibold hover:bg-surface-hover">
          Edit details
        </button>
      ) : null}
      {editing ? <EditDetailsDialog video={video} open onClose={() => setEditing(false)} /> : null}
    </div>
  );

  if (episode) {
    const seasons = new Set(upNext.map((v) => v.season));
    const heading = seasons.size === 1 && video.season != null && seasons.has(video.season) ? `Up next in Season ${video.season}` : "Up next";
    return (
      <div className="grid gap-8 py-2 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="-mx-4 md:-mx-6 lg:mx-0">{player}</div>
          {details}
        </div>
        {upNext.length > 0 ? (
          <section aria-labelledby="up-next" className="flex min-w-0 flex-col gap-4">
            <h2 id="up-next" className="font-display text-2xl font-bold tracking-[-0.01em]">
              {heading}
            </h2>
            <ul aria-label={heading} className="-mx-2 flex flex-col gap-1">
              {upNext.map((v) => (
                <li key={v.id}>
                  <EpisodeRow video={v} compact description={longDuration(v.durationMs)} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-2">
      <div className="-mx-4 md:-mx-6 lg:mx-0">{player}</div>
      {details}
      {upNext.length > 0 ? (
        <div className="mt-4">
          <Carousel title="Up next" wide items={upNext.map((v) => <VideoCard key={v.id} video={v} />)} />
        </div>
      ) : null}
    </div>
  );
}
