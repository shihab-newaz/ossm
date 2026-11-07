"use client";

import { ArrowLeft, Download, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { player } from "@/player/player";
import { useVideo, videoDownloadUrl, videoStreamUrl, type Video } from "./data";
import { formatBytes } from "./format";

/** Watch one video of your vault: the original, played straight from the store through the API. */
export function WatchScreen({ id }: { id: string }) {
  const video = useVideo(id);

  return (
    <div className="flex flex-col gap-6 py-8">
      <Link href="/videos" className="flex w-fit items-center gap-2 text-[14px] font-medium text-fg-muted hover:text-fg">
        <ArrowLeft size={18} aria-hidden />
        Videos
      </Link>
      {video.isPending ? <div role="status" aria-label="Loading this video" className="aspect-video w-full rounded-card bg-bg-subtle motion-safe:animate-pulse" /> : null}
      {video.isError ? (
        video.error.message === "not-found" ? (
          <div className="flex flex-col items-start gap-3 py-6">
            <h1 className="font-display text-2xl font-bold">Video not found</h1>
            <p className="text-fg-muted">It may have been deleted, or it is not in your vault.</p>
          </div>
        ) : (
          <div role="alert" className="flex flex-col items-start gap-3 py-6">
            <p className="text-danger">{video.error.message}</p>
            <button onClick={() => void video.refetch()} className="h-9 rounded-full border border-border-strong px-4 text-[14px] font-semibold hover:bg-surface-hover">
              Try again
            </button>
          </div>
        )
      ) : null}
      {/* Keyed by id so moving to another video never keeps the last one's "can't play" state. */}
      {video.data ? <Watching key={video.data.id} video={video.data} /> : null}
    </div>
  );
}

function Watching({ video }: { video: Video }) {
  const [unplayable, setUnplayable] = useState(false);
  const uploaded = new Date(video.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <>
      {unplayable ? (
        <div role="alert" className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-card bg-bg-subtle px-6 text-center">
          <TriangleAlert size={40} aria-hidden strokeWidth={1.5} className="text-fg-subtle" />
          <h2 className="font-display text-xl font-bold">This browser can&apos;t play this file</h2>
          <p className="max-w-prose text-fg-muted">The original is kept exactly as you uploaded it, and some formats only play in some browsers. You can download it and open it in a player that supports it.</p>
          <DownloadButton id={video.id} />
        </div>
      ) : (
        <video
          data-testid="video-player"
          src={videoStreamUrl(video.id)}
          controls
          playsInline
          preload="metadata"
          // Two things should never play at once: starting a video stops the music.
          onPlay={() => player.pause()}
          onError={() => setUnplayable(true)}
          className="aspect-video w-full rounded-card bg-black"
        />
      )}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="min-w-0 break-words font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">{video.title}</h1>
          {unplayable ? null : <DownloadButton id={video.id} />}
        </div>
        <p className="text-[14px] text-fg-muted">
          Uploaded {uploaded} · {formatBytes(video.sizeBytes)} · {video.container}
        </p>
        {video.description ? <p className="max-w-prose whitespace-pre-wrap text-fg">{video.description}</p> : null}
      </div>
    </>
  );
}

/** A plain link to the attachment endpoint: the browser saves the original under its own name. */
function DownloadButton({ id }: { id: string }) {
  return (
    <a
      href={videoDownloadUrl(id)}
      download
      className="flex h-10 items-center gap-2 rounded-full border border-border-strong px-5 text-[15px] font-semibold hover:bg-surface-hover"
    >
      <Download size={18} aria-hidden />
      Download original
    </a>
  );
}
