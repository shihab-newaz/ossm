"use client";

import { ListMusic, Music, Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { useEffect } from "react";
import { formatTime } from "@/player/format";
import { player, usePlayer } from "@/player/player";
import { Slider } from "@/player/Slider";

/** The persistent player (DESIGN.md 4.8). Queue, previous and next arrive with the queue slice. */
export function PlayerBar() {
  const { track, status, currentTime, duration, volume, muted } = usePlayer();

  // Leaving the app shell (logout, session expiry) must not leave music playing behind the login page.
  useEffect(() => () => player.stop(), []);

  const playing = status === "playing" || status === "loading";
  const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <section
      aria-label="Player"
      className="fixed inset-x-0 bottom-[var(--tabbar-height)] z-20 grid h-16 grid-cols-[1fr_auto] items-center gap-4 border-t border-border bg-surface px-4 shadow-[var(--shadow-up)] lg:bottom-0 lg:h-20 lg:grid-cols-[3fr_4fr_3fr] lg:px-6"
    >
      {/* Mobile mini-player: a 2px progress line on top instead of the slider. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-border lg:hidden">
        <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
      </div>

      <div className="flex min-w-0 items-center gap-3">
        {track ? (
          <>
            {track.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authenticated cover art
              <img src={track.coverUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover lg:size-14" />
            ) : (
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-bg-subtle text-fg-subtle lg:size-14">
                <Music size={20} />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{track.title}</p>
              <p className="truncate text-[13px] text-fg-muted">{track.artist}</p>
            </div>
          </>
        ) : (
          <p className="text-[14px] text-fg-subtle">Nothing playing</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <button aria-label="Previous" disabled className="hidden size-11 cursor-not-allowed place-items-center rounded-full text-fg-muted opacity-40 sm:grid">
            <SkipBack size={20} aria-hidden />
          </button>
          <button
            aria-label={playing ? "Pause" : "Play"}
            aria-busy={status === "loading"}
            disabled={!track}
            onClick={() => void player.toggle()}
            className="grid size-10 place-items-center rounded-full bg-accent text-on-accent hover:bg-accent-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {playing ? <Pause size={20} aria-hidden fill="currentColor" /> : <Play size={20} aria-hidden fill="currentColor" />}
          </button>
          <button aria-label="Next" disabled className="hidden size-11 cursor-not-allowed place-items-center rounded-full text-fg-muted opacity-40 sm:grid">
            <SkipForward size={20} aria-hidden />
          </button>
        </div>
        <div className="hidden w-full max-w-[560px] items-center gap-3 lg:flex">
          <span className="w-10 text-right font-mono text-[12px] font-medium leading-4 text-fg-muted [font-variant-numeric:tabular-nums]">{formatTime(currentTime)}</span>
          <Slider
            label="Seek"
            value={currentTime}
            max={duration}
            step={1}
            disabled={!track}
            valueText={track ? `${formatTime(currentTime)} of ${formatTime(duration)}` : undefined}
            onChange={(seconds) => player.seek(seconds)}
          />
          <span className="w-10 font-mono text-[12px] font-medium leading-4 text-fg-muted [font-variant-numeric:tabular-nums]">
            <span className="sr-only">Remaining </span>-{formatTime(duration - currentTime)}
          </span>
        </div>
      </div>

      <div className="hidden items-center justify-end gap-2 lg:flex">
        <button aria-label="Queue" disabled className="grid size-11 cursor-not-allowed place-items-center rounded-full text-fg-muted opacity-40">
          <ListMusic size={20} aria-hidden />
        </button>
        {track ? (
          <>
            <button
              aria-label={muted ? "Unmute" : "Mute"}
              onClick={() => player.setMuted(!muted)}
              className="grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-hover"
            >
              <VolumeIcon size={20} aria-hidden />
            </button>
            <Slider
              label="Volume"
              value={muted ? 0 : volume}
              max={1}
              step={0.01}
              valueText={`${Math.round((muted ? 0 : volume) * 100)}%`}
              onChange={(level) => player.setVolume(level)}
              className="max-w-[100px]"
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
