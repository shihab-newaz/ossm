"use client";

import { Captions, Check, Maximize, Minimize, Pause, PictureInPicture2, Play, Plus, Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatTime } from "@/player/format";
import { player } from "@/player/player";
import { Slider } from "@/player/Slider";
import { saveProgress, videoStreamUrl, type Subtitle, type Video } from "./data";
import { createVideoEngine, useVideoState, type MediaLike, type VideoEngine } from "./engine";
import { episodeRowTitle } from "./format";
import { Back10, FilmOff, Forward10 } from "./icons";
import { handleVideoShortcut } from "./keymap";
import { createProgressReporter, resumePosition } from "./progress";
import { Thumb } from "./Thumb";

const HIDE_CONTROLS_AFTER_MS = 3000;
const RESUME_TOAST_MS = 6000;
/** The next-episode card appears this close to the end. */
const NEXT_CARD_SECONDS = 20;
const NEXT_COUNTDOWN_SECONDS = 10;
const SUBTITLE_KEY = "ossm.subtitles";

type Props = {
  video: Video;
  subtitles: Subtitle[];
  /** The next episode, for the end-of-episode card. */
  next?: Video;
  onNext?: (next: Video) => void;
  /** Lets the person attach a subtitle file from the menu. */
  onAddSubtitle?: (file: File) => void;
  /** Creates the media element's engine. Tests pass one driving a fake element. */
  engineFactory?: () => VideoEngine;
  /** Called with the <video> element, for tests to swap in a fake. */
  mediaRef?: (el: HTMLVideoElement) => MediaLike;
};

/** Pauses the music when a video starts: two things never play at once. Music does not come back on its own. */
function pauseMusic() {
  const { status } = player.getState();
  if (status === "playing" || status === "loading") player.pause();
}

function savedSubtitleLanguage(): string | null {
  try {
    return localStorage.getItem(SUBTITLE_KEY);
  } catch {
    return null;
  }
}

function rememberSubtitleLanguage(language: string | null) {
  try {
    if (language) localStorage.setItem(SUBTITLE_KEY, language);
    else localStorage.setItem(SUBTITLE_KEY, "off");
  } catch {
    // Storage can be blocked; the choice still applies to this video.
  }
}

/** Shows one subtitle track (by index) and hides the rest; null hides them all. */
function showSubtitle(el: HTMLVideoElement | null, index: number | null) {
  const tracks = el?.textTracks;
  if (!tracks) return;
  for (let i = 0; i < tracks.length; i++) {
    tracks[i].mode = tracks[i].id === `sub-${index}` ? "showing" : "disabled";
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const control = "grid size-11 shrink-0 place-items-center rounded-full text-white hover:bg-white/15 sm:size-10";

export function VideoPlayer({ video, subtitles, next, onNext, onAddSubtitle, engineFactory, mediaRef }: Props) {
  const [engine] = useState(() => engineFactory?.() ?? createVideoEngine({ onStart: pauseMusic }));
  const state = useVideoState(engine);
  const root = useRef<HTMLDivElement>(null);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const [resumedAt] = useState(() => resumePosition(video.progress));

  // Progress: throttled while playing, straight away on pause, seek and leaving.
  const [reporter] = useState(() => createProgressReporter((pos, dur, { keepalive }) => saveProgress(video.id, pos, dur, keepalive)));
  const position = useRef({ ms: 0, durationMs: video.durationMs });
  useEffect(() => {
    position.current = { ms: state.currentTime * 1000, durationMs: state.duration > 0 ? state.duration * 1000 : video.durationMs };
  }, [state.currentTime, state.duration, video.durationMs]);

  // A seek is saved once the person stops dragging, not for every step of the drag.
  const seekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(seekTimer.current), []);

  const attach = useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el) return;
      videoEl.current = el;
      engine.attach(mediaRef ? mediaRef(el) : el);
      void engine.load(videoStreamUrl(video.id), { startAt: resumedAt / 1000, durationSeconds: video.durationMs / 1000 });
    },
    // The element and the file are set up once per video; the watch page remounts this for another one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const leave = () => reporter.leave(position.current.ms, position.current.durationMs);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      if (position.current.ms > 0) leave();
      engine.detach();
    };
  }, [engine, reporter]);

  useEffect(() => {
    if (state.status === "playing") reporter.tick(position.current.ms, position.current.durationMs);
    else if (state.status === "paused" || state.status === "ended") reporter.flush(position.current.ms, position.current.durationMs);
  }, [state.status, state.currentTime, reporter]);

  // Controls hide after 3 s without the pointer moving, while playing.
  const [awake, setAwake] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wake = useCallback(() => {
    setAwake(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setAwake(false), HIDE_CONTROLS_AFTER_MS);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  const playing = state.status === "playing" || state.status === "loading";
  const [menuOpen, setMenuOpen] = useState(false);
  const controlsVisible = awake || !playing || menuOpen;

  // Subtitles: the remembered language if this video has it, otherwise off.
  const [subtitle, setSubtitle] = useState<number | null>(() => {
    const language = savedSubtitleLanguage();
    return subtitles.find((s) => s.language && s.language === language)?.index ?? null;
  });
  useEffect(() => showSubtitle(videoEl.current, subtitle), [subtitle, subtitles]);
  function chooseSubtitle(index: number | null) {
    setSubtitle(index);
    rememberSubtitleLanguage(index === null ? null : (subtitles.find((s) => s.index === index)?.language ?? null));
    setMenuOpen(false);
  }

  // Fullscreen and picture-in-picture, where the browser has them.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const canFullscreen = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const canPip = typeof document !== "undefined" && !!document.pictureInPictureEnabled;
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void root.current?.requestFullscreen?.();
  }, []);
  function togglePip() {
    if (document.pictureInPictureElement) void document.exitPictureInPicture?.();
    else void videoEl.current?.requestPictureInPicture?.();
  }

  const toggleSubtitles = useCallback(() => {
    if (subtitles.length === 0) return;
    const saved = savedSubtitleLanguage();
    const fallback = subtitles.find((s) => s.language === saved) ?? subtitles[0];
    chooseSubtitle(subtitle === null ? fallback.index : null);
    // chooseSubtitle only reads stable values; listing it would re-bind the keys on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitle, subtitles]);

  // Keys belong to the video while it is on screen. They are handled before the music's shortcuts
  // and stopped there, so Space never toggles both.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.target as HTMLElement | null)?.closest?.('[role="dialog"], [role="menu"]')) return;
      if (handleVideoShortcut(event, engine, { toggleFullscreen, toggleSubtitles })) {
        event.preventDefault();
        event.stopPropagation();
        wake();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [engine, toggleFullscreen, toggleSubtitles, wake]);

  // "Resumed at 21:40 · Start over", for a few seconds after arriving.
  const [resumeToast, setResumeToast] = useState(resumedAt > 0);
  useEffect(() => {
    if (!resumeToast) return;
    const t = setTimeout(() => setResumeToast(false), RESUME_TOAST_MS);
    return () => clearTimeout(t);
  }, [resumeToast]);

  // The next episode, offered in the last 20 seconds and at the end.
  const [nextDismissed, setNextDismissed] = useState(false);
  const nearEnd = state.status === "ended" || (state.duration > 0 && state.duration - state.currentTime <= NEXT_CARD_SECONDS && state.currentTime > 0);
  const showNext = !!next && nearEnd && !nextDismissed;

  const VolumeIcon = state.muted || state.volume === 0 ? VolumeX : state.volume < 0.5 ? Volume1 : Volume2;
  const duration = state.duration > 0 ? state.duration : video.durationMs / 1000;

  if (state.status === "error") return <CannotPlay video={video} />;

  return (
    <div
      ref={root}
      role="region"
      aria-label="Video player"
      onPointerMove={wake}
      onPointerDown={wake}
      className={`relative overflow-hidden bg-black lg:rounded-card ${fullscreen ? "grid place-items-center" : ""} ${controlsVisible ? "" : "cursor-none"}`}
    >
      <video
        ref={attach}
        playsInline
        preload="metadata"
        poster={video.thumbnailUrl}
        onClick={() => void engine.toggle()}
        onDoubleClick={toggleFullscreen}
        className="block aspect-video w-full bg-black object-contain"
      >
        {subtitles.map((s) => (
          <track key={s.index} id={`sub-${s.index}`} kind="subtitles" src={s.url} srcLang={s.language} label={s.label} />
        ))}
      </video>

      {state.buffering ? (
        <span role="status" aria-label="Loading" className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="size-10 rounded-full border-2 border-white/30 border-t-white motion-safe:animate-spin" />
        </span>
      ) : null}

      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-2.5 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-16 text-white transition-opacity duration-200 focus-within:opacity-100 sm:px-5 sm:pb-3.5 ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="mx-1 sm:mx-2">
          <Slider
            label="Seek"
            value={state.currentTime}
            max={duration}
            step={1}
            valueText={`${formatTime(state.currentTime)} of ${formatTime(duration)}`}
            onChange={(v) => {
              engine.seek(v);
              clearTimeout(seekTimer.current);
              seekTimer.current = setTimeout(() => reporter.flush(v * 1000, duration * 1000), 600);
            }}
            className="slider-accent"
          />
        </div>
        <div className="flex items-center gap-1">
          <button aria-label={playing ? "Pause" : "Play"} onClick={() => void engine.toggle()} className={control}>
            {playing ? <Pause size={24} aria-hidden fill="currentColor" /> : <Play size={24} aria-hidden fill="currentColor" />}
          </button>
          <button aria-label="Back 10 seconds" onClick={() => engine.skip(-10)} className={control}>
            <Back10 size={24} />
          </button>
          <button aria-label="Forward 10 seconds" onClick={() => engine.skip(10)} className={control}>
            <Forward10 size={24} />
          </button>
          <div className="ml-1 hidden items-center gap-2 sm:flex">
            <button aria-label={state.muted ? "Unmute" : "Mute"} onClick={() => engine.setMuted(!state.muted)} className={control}>
              <VolumeIcon size={22} aria-hidden />
            </button>
            <Slider label="Volume" value={state.muted ? 0 : state.volume} max={1} step={0.01} onChange={(v) => engine.setVolume(v)} className="w-[100px]" />
          </div>
          <span className="ml-2 font-mono text-[12px] font-medium tabular-nums sm:ml-4 sm:text-[13px]">
            {formatTime(state.currentTime)} / {formatTime(duration)}
          </span>
          <span className="flex-1" />
          <SubtitlesMenu
            subtitles={subtitles}
            selected={subtitle}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            onChoose={chooseSubtitle}
            onAdd={onAddSubtitle}
          />
          {canPip ? (
            <button aria-label="Picture in picture" onClick={togglePip} className={control}>
              <PictureInPicture2 size={22} aria-hidden />
            </button>
          ) : null}
          {canFullscreen ? (
            <button aria-label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen} className={control}>
              {fullscreen ? <Minimize size={22} aria-hidden /> : <Maximize size={22} aria-hidden />}
            </button>
          ) : null}
        </div>
      </div>

      {showNext && next ? <NextEpisodeCard next={next} onPlay={() => onNext?.(next)} onCancel={() => setNextDismissed(true)} /> : null}

      {resumeToast ? (
        <div role="status" className="absolute inset-x-0 bottom-24 flex justify-center px-4">
          <div className="flex h-11 items-center gap-4 rounded-full bg-fg pl-5 pr-1.5 text-[15px] font-medium text-bg shadow-[var(--shadow-3)]">
            <span>
              Resumed at <span className="font-mono tabular-nums">{formatTime(resumedAt / 1000)}</span>
            </span>
            <button
              onClick={() => {
                engine.seek(0);
                reporter.flush(0, duration * 1000);
                setResumeToast(false);
              }}
              className="h-8 rounded-full px-3.5 font-semibold underline underline-offset-2 hover:bg-bg/15"
            >
              Start over
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SubtitlesMenu({
  subtitles,
  selected,
  open,
  onOpenChange,
  onChoose,
  onAdd,
}: {
  subtitles: Subtitle[];
  selected: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (index: number | null) => void;
  onAdd?: (file: File) => void;
}) {
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    wrapper.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"], [role="menuitemradio"]')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, onOpenChange]);

  if (subtitles.length === 0 && !onAdd) return null;

  function onMenuKey(event: React.KeyboardEvent) {
    const items = Array.from(wrapper.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.stopPropagation();
      onOpenChange(false);
      wrapper.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    }
  }

  const item = "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[15px] font-medium hover:bg-surface-hover focus-visible:bg-surface-hover";
  const on = selected !== null;
  return (
    <div ref={wrapper} className="relative">
      <button
        aria-label="Subtitles"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => onOpenChange(!open)}
        className={`${control} flex-col gap-[3px] ${open ? "bg-white/15" : ""}`}
      >
        <Captions size={24} aria-hidden />
        <span aria-hidden className={`h-0.5 w-4 rounded-full ${on ? "bg-accent" : "bg-transparent"}`} />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Subtitles"
          onKeyDown={onMenuKey}
          className="absolute bottom-full right-0 mb-3 flex w-[220px] flex-col gap-0.5 rounded-card bg-surface p-1.5 text-fg shadow-[var(--shadow-3)]"
        >
          <button role="menuitemradio" aria-checked={selected === null} onClick={() => onChoose(null)} className={item}>
            <span className="flex w-[18px]">{selected === null ? <Check size={18} aria-hidden /> : null}</span>
            Off
          </button>
          {subtitles.map((s) => (
            <button key={s.index} role="menuitemradio" aria-checked={selected === s.index} onClick={() => onChoose(s.index)} className={item}>
              <span className="flex w-[18px]">{selected === s.index ? <Check size={18} aria-hidden /> : null}</span>
              {s.label}
            </button>
          ))}
          {onAdd ? (
            <>
              <div role="separator" className="mx-1 my-1 h-px bg-border" />
              <button role="menuitem" onClick={() => file.current?.click()} className={`${item} text-fg-muted`}>
                <span className="flex w-[18px]">
                  <Plus size={18} aria-hidden />
                </span>
                Add subtitle file…
              </button>
              <input
                ref={file}
                type="file"
                accept=".srt,.vtt,text/vtt"
                aria-label="Subtitle file"
                className="hidden"
                onChange={(e) => {
                  const chosen = e.target.files?.[0];
                  if (chosen) onAdd(chosen);
                  e.target.value = "";
                  onOpenChange(false);
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** "Next episode" with a 10 s countdown ring; no countdown when motion is reduced, just the button. */
function NextEpisodeCard({ next, onPlay, onCancel }: { next: Video; onPlay: () => void; onCancel: () => void }) {
  const [reduced] = useState(prefersReducedMotion);
  const [left, setLeft] = useState(NEXT_COUNTDOWN_SECONDS);
  const fired = useRef(false);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [reduced]);
  useEffect(() => {
    if (!reduced && left === 0 && !fired.current) {
      fired.current = true;
      onPlay();
    }
  }, [left, reduced, onPlay]);

  const C = 2 * Math.PI * 22;
  const title = episodeRowTitle(next);
  return (
    <div role="dialog" aria-label="Next episode" className="absolute bottom-3 right-3 flex w-[min(340px,calc(100%-24px))] flex-col gap-3 rounded-card bg-surface p-3 text-fg shadow-[var(--shadow-3)] sm:bottom-5 sm:right-5">
      <div className="flex items-center gap-3">
        <span className="w-32 shrink-0">
          <Thumb src={next.thumbnailUrl} radius="row" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-fg-muted">Next episode</span>
          <span className="truncate text-[15px] font-semibold leading-5">{title}</span>
        </span>
      </div>
      <div className="flex items-center justify-between">
        <button onClick={onPlay} aria-label={reduced ? `Play ${title}` : `Play ${title}, starting in ${left} seconds`} className="relative grid size-12 place-items-center">
          {reduced ? null : (
            <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden className="absolute inset-0 -rotate-90">
              <circle cx="24" cy="24" r="22" fill="none" stroke="var(--border-strong)" strokeWidth="2" />
              <circle cx="24" cy="24" r="22" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - left / NEXT_COUNTDOWN_SECONDS)} />
            </svg>
          )}
          <span className="grid size-10 place-items-center rounded-full bg-accent font-mono text-[15px] font-medium text-on-accent">
            {reduced ? <Play size={20} aria-hidden fill="currentColor" /> : <span aria-hidden>{left}</span>}
          </span>
        </button>
        <button onClick={onCancel} className="h-10 rounded-full px-4 text-[15px] font-semibold text-fg-muted hover:bg-surface-hover">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The player's place when the file cannot play here (DESIGN.md empty state on the dark surface). */
export function CannotPlay({ video, onTry }: { video: Video; onTry?: () => void }) {
  const what = [video.container?.toUpperCase(), video.videoCodec ? `${video.videoCodec.toUpperCase()} video` : null].filter(Boolean).join(" with ");
  return (
    <div role="region" aria-label="Video player" className="flex aspect-video flex-col items-center justify-center gap-3 bg-surface p-8 text-center lg:rounded-card">
      <FilmOff size={64} className="mb-2 text-fg-subtle [&_*]:[stroke-width:1.5]" />
      <h2 className="font-display text-xl font-bold leading-[26px]">This file may not play in this browser</h2>
      <p className="max-w-[520px] text-fg-muted [text-wrap:pretty]">
        OSSM plays files as they were uploaded.{what ? ` This one is ${what}, which this browser may not support.` : " This browser could not play it."}
      </p>
      {onTry ? (
        <button onClick={onTry} className="mt-2 h-10 rounded-full border border-border-strong px-4 text-[15px] font-semibold hover:bg-surface-hover">
          Try anyway
        </button>
      ) : null}
    </div>
  );
}
