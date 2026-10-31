import type { Video } from "./data";

/** "4K", "1080P", "720P" from the frame height; anything smaller is its height, like "480P". */
export function resolutionLabel(height: number | undefined): string | null {
  if (!height || height <= 0) return null;
  if (height >= 2000) return "4K";
  if (height >= 1000) return "1080P";
  if (height >= 700) return "720P";
  return `${height}P`;
}

const CODECS: Record<string, string> = { h264: "H.264", avc: "H.264", avc1: "H.264", hevc: "HEVC", h265: "HEVC", av1: "AV1", vp9: "VP9", vp8: "VP8" };

/** ffprobe's codec name as people know it: h264 is "H.264", hevc is "HEVC". */
export function codecLabel(codec: string | undefined): string | null {
  if (!codec) return null;
  return CODECS[codec.toLowerCase()] ?? codec.toUpperCase();
}

/** The quality badge: "1080P · H.264", or whichever half is known. Null when neither is. */
export function videoQuality(video: Pick<Video, "height" | "videoCodec">): string | null {
  const parts = [resolutionLabel(video.height), codecLabel(video.videoCodec)].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Rounded to the minute, for cards: "10m", "1h 04m". */
export function shortDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** For the watch page: "14m 48s", "42m" on the minute, "1h 04m" from an hour. */
export function longDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total >= 3600) return shortDuration(ms);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** "S2 · E5": where an episode sits in its show. */
export function episodeCode(video: Pick<Video, "season" | "episode">): string {
  return [video.season != null ? `S${video.season}` : null, video.episode != null ? `E${video.episode}` : null].filter(Boolean).join(" · ");
}

/** The line under a card: "2010 · 15m" for a movie, "S2 · E5 · The Long Way Home" for an episode. */
export function cardSubtitle(video: Video): string {
  if (video.kind === "EPISODE") return [episodeCode(video), video.title].filter(Boolean).join(" · ");
  return [video.year, shortDuration(video.durationMs)].filter(Boolean).join(" · ");
}

/** A card's title: the movie, or for an episode, its show. */
export function cardTitle(video: Video): string {
  return video.kind === "EPISODE" ? (video.showName ?? video.title) : video.title;
}

/** An episode row's title: "E5 · The Long Way Home". */
export function episodeRowTitle(video: Video): string {
  return video.episode != null ? `E${video.episode} · ${video.title}` : video.title;
}

/** How far through a video someone is, 0 to 100, for the bar on its thumbnail. 0 when watched or not started. */
export function progressPercent(video: Pick<Video, "progress" | "durationMs">): number {
  const p = video.progress;
  if (!p || p.watched || p.positionMs <= 0) return 0;
  const duration = p.durationMs > 0 ? p.durationMs : video.durationMs;
  return duration > 0 ? Math.min(100, Math.max(1, Math.round((p.positionMs / duration) * 100))) : 0;
}

/** "3 seasons · 24 episodes" */
export function showCounts(seasonCount: number, episodeCount: number): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return `${n(seasonCount, "season", "seasons")} · ${n(episodeCount, "episode", "episodes")}`;
}
