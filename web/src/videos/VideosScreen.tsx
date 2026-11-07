"use client";

import { Clapperboard, Film, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { UploadList, useUploadQueue } from "@/upload/UploadQueue";
import { useVideoPages, type Video } from "./data";
import { formatBytes } from "./format";

/** Your vault: a grid of your own videos, newest first, and the way to add more. */
export function VideosScreen() {
  const { items, add } = useUploadQueue("VIDEO");
  const { videos, query } = useVideoPages();
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    add(Array.from(event.dataTransfer.files));
  }

  const choose = () => input.current?.click();
  const empty = query.isSuccess && videos.length === 0 && items.length === 0;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex flex-col gap-8 rounded-banner py-8 ${dragging ? "outline-2 outline-dashed outline-offset-4 outline-accent" : ""}`}
    >
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">Videos</h1>
        <button
          onClick={choose}
          className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent hover:bg-accent-hover active:scale-[0.97]"
        >
          <UploadCloud size={20} aria-hidden />
          Upload videos
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept="video/*,.mp4,.m4v,.mov,.webm,.mkv"
          aria-label="Video files"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      <UploadList items={items} kind="VIDEO" />

      {query.isPending ? <TileSkeleton /> : null}
      {query.isError ? (
        <div role="alert" className="flex flex-col items-start gap-3 py-6">
          <p className="text-danger">Could not load your videos.</p>
          <button onClick={() => void query.refetch()} className="h-9 rounded-full border border-border-strong px-4 text-[14px] font-semibold hover:bg-surface-hover">
            Try again
          </button>
        </div>
      ) : null}
      {empty ? (
        <div className="flex flex-col items-start gap-3 py-10">
          <Clapperboard size={64} aria-hidden strokeWidth={1.25} className="text-fg-subtle" />
          <h2 className="font-display text-xl font-bold">Your vault is empty</h2>
          <p className="text-fg-muted">Upload videos to keep them here. Only you can see your vault, and every original is kept exactly as you uploaded it.</p>
          <button onClick={choose} className="grid h-10 place-items-center rounded-full border border-border-strong px-5 text-[15px] font-semibold hover:bg-surface-hover">
            Choose videos
          </button>
        </div>
      ) : null}
      {videos.length > 0 ? (
        <>
          <ul aria-label="Your videos" className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {videos.map((video) => (
              <li key={video.id}>
                <VideoTile video={video} />
              </li>
            ))}
          </ul>
          <LoadMore hasMore={query.hasNextPage} loading={query.isFetchingNextPage} onMore={query.fetchNextPage} />
        </>
      ) : null}
    </div>
  );
}

/** A 16:9 tile that opens the watch page. Until thumbnails exist it shows a placeholder. */
function VideoTile({ video }: { video: Video }) {
  return (
    <Link href={`/watch/${video.id}`} className="group flex flex-col gap-2 rounded-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">
      <div className="grid aspect-video place-items-center rounded-card bg-bg-subtle">
        <Film size={40} aria-hidden strokeWidth={1.25} className="text-fg-subtle" />
      </div>
      <h2 className="line-clamp-2 text-[15px] font-semibold leading-5 group-hover:underline">{video.title}</h2>
      <p className="text-[13px] text-fg-muted">
        {video.container} · {formatBytes(video.sizeBytes)}
      </p>
    </Link>
  );
}

/** Loads the next page when this scrolls into view, with a button for anyone who cannot scroll to it. */
function LoadMore({ hasMore, loading, onMore }: { hasMore: boolean; loading: boolean; onMore: () => unknown }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = button.current;
    if (!element || !hasMore || loading || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) void onMore(); }, { rootMargin: "400px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, loading, onMore]);
  if (!hasMore) return null;
  return (
    <button
      ref={button}
      onClick={() => void onMore()}
      disabled={loading}
      className="h-10 self-center rounded-full border border-border-strong px-5 text-[15px] font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      {loading ? "Loading…" : "Show more videos"}
    </button>
  );
}

function TileSkeleton() {
  return (
    <div role="status" aria-label="Loading your vault" className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className="flex flex-col gap-2 motion-safe:animate-pulse">
          <div className="aspect-video rounded-card bg-bg-subtle" />
          <div className="h-3 w-2/3 rounded bg-bg-subtle" />
          <div className="h-3 w-1/3 rounded bg-bg-subtle" />
        </div>
      ))}
    </div>
  );
}
