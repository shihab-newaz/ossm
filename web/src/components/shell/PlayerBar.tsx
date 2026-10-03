"use client";

import { ListMusic, Music, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { attachMediaSession } from "@/player/mediaSession";
import { formatTime } from "@/player/format";
import { player, usePlayer, type Repeat as RepeatMode } from "@/player/player";
import { QueueDrawer } from "@/player/QueueDrawer";
import { Slider } from "@/player/Slider";

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };
const REPEAT_LABEL: Record<RepeatMode, string> = { off: "Repeat: off", all: "Repeat: all", one: "Repeat: one" };

const small = "grid size-11 place-items-center rounded-full hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40";

/** The persistent player (DESIGN.md 4.8). */
export function PlayerBar() {
  const { track, status, currentTime, duration, volume, muted, shuffle, repeat, queue, index } = usePlayer();
  const [queueOpen, setQueueOpen] = useState(false);

  // Lock screen and media keys follow the player for as long as the app shell is on screen.
  useEffect(() => attachMediaSession(player), []);

  const playing = status === "playing" || status === "loading";
  const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  // At the end of the queue with repeat off there is nothing after this track.
  const hasNext = repeat === "all" ? queue.length > 0 : index + 1 < queue.length;

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
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            aria-label="Shuffle"
            aria-pressed={shuffle}
            onClick={() => player.setShuffle(!shuffle)}
            className={`${small} hidden sm:grid ${shuffle ? "text-accent" : "text-fg-muted"}`}
          >
            <Shuffle size={20} aria-hidden />
          </button>
          <button aria-label="Previous" disabled={!track} onClick={() => void player.previous()} className={`${small} hidden text-fg sm:grid`}>
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
          <button aria-label="Next" disabled={!track || !hasNext} onClick={() => void player.next()} className={`${small} text-fg`}>
            <SkipForward size={20} aria-hidden />
          </button>
          <button
            aria-label={REPEAT_LABEL[repeat]}
            aria-pressed={repeat !== "off"}
            onClick={() => player.setRepeat(NEXT_REPEAT[repeat])}
            className={`${small} hidden sm:grid ${repeat !== "off" ? "text-accent" : "text-fg-muted"}`}
          >
            <RepeatIcon size={20} aria-hidden />
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
        <button
          aria-label="Queue"
          aria-expanded={queueOpen}
          aria-haspopup="dialog"
          onClick={() => setQueueOpen(true)}
          className={`${small} text-fg-muted`}
        >
          <ListMusic size={20} aria-hidden />
        </button>
        {track ? (
          <>
            <button aria-label={muted ? "Unmute" : "Mute"} onClick={() => player.setMuted(!muted)} className={`${small} text-fg-muted`}>
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
      <QueueDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />
    </section>
  );
}
