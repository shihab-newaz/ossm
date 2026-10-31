import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { problemMessage } from "@/auth/session";

export type Upload = components["schemas"]["Upload"];
type UploadPart = components["schemas"]["UploadPart"];

export const MAX_BYTES = 250 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024 * 1024;
export const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;

export type License = NonNullable<components["schemas"]["CreateUploadRequest"]["license"]>;
export const DEFAULT_LICENSE: License = "All rights reserved";
export const LICENSES: License[] = ["All rights reserved", "CC BY", "CC BY-SA", "CC BY-NC", "CC BY-ND", "CC BY-NC-SA", "CC BY-NC-ND", "CC0"];

const AUDIO = new Set(["mp3", "flac", "m4a", "aac", "ogg", "oga", "opus", "wav"]);
const VIDEO = new Set(["mp4", "m4v", "mov", "webm", "mkv"]);
const SUBTITLE = new Set(["srt", "vtt"]);

export type FileKind = "audio" | "video" | "subtitle";

const extension = (name: string) => name.slice(name.lastIndexOf(".") + 1).toLowerCase();

/** What a file is by its extension, or null for anything OSSM does not take (cover images, .nfo files…). The server still checks the bytes. */
export function kindOf(name: string): FileKind | null {
  const ext = extension(name);
  if (!name.includes(".")) return null;
  if (VIDEO.has(ext)) return "video";
  if (SUBTITLE.has(ext)) return "subtitle";
  if (AUDIO.has(ext)) return "audio";
  return null;
}

/** Why a file should not even be offered to the server, or null if it looks fine. */
export function rejectionReason(file: { name: string; size: number }): string | null {
  if (file.size === 0) return "This file is empty.";
  const kind = kindOf(file.name);
  if (kind === "video" && file.size > MAX_VIDEO_BYTES) return "Videos can be at most 20 GB.";
  if (kind === "subtitle" && file.size > MAX_SUBTITLE_BYTES) return "Subtitle files can be at most 2 MB.";
  if (kind !== "video" && kind !== "subtitle" && file.size > MAX_BYTES) return "Files can be at most 250 MB.";
  return null;
}

/** "Sintel.2010.en.srt" belongs to "Sintel.2010.mp4": the name without extension, language and flags. */
export function subtitleStem(name: string): string {
  return name
    .replace(/\.(srt|vtt)$/i, "")
    .replace(/[._ -](forced|sdh|cc)$/i, "")
    .replace(/[._ -][a-z]{2,3}$/i, "")
    .toLowerCase();
}

export function videoStem(name: string): string {
  return name.replace(/\.[^.]+$/, "").toLowerCase();
}

/** Every file in what was dropped, walking into folders. */
export async function filesFromDrop(items: DataTransferItemList | undefined, fallback: FileList): Promise<File[]> {
  const entries = Array.from(items ?? [])
    .map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (entries.length === 0) return Array.from(fallback);
  const files: File[] = [];
  for (const entry of entries) files.push(...(await walk(entry)));
  return files;
}

async function walk(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return [await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries hands back a batch at a time until it returns none.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    children.push(...batch);
  }
  const files: File[] = [];
  for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) files.push(...(await walk(child)));
  return files;
}

/** PUT one part straight to the object store and resolve with its ETag. XHR, because fetch cannot report upload progress. */
function putPart(url: string, part: Blob, onLoaded: (bytes: number) => void, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => onLoaded(event.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
      else reject(new Error(`The storage server refused part of the file (status ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Lost the connection while uploading."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(part);
  });
}

async function moreParts(uploadId: string, from: number): Promise<UploadPart[]> {
  const { data, error } = await api.GET("/api/v1/uploads/{id}/parts", { params: { path: { id: uploadId }, query: { from } } });
  if (!data) throw problemMessage(error, "Could not continue the upload.");
  return data;
}

/**
 * Uploads one file the way the API expects: ask for presigned part URLs (a page at a time for big
 * videos), send each part directly to storage, then say it is complete so ingest can start.
 * Progress is reported in bytes sent.
 */
export async function uploadFile(file: File, license: License, onProgress: (sentBytes: number) => void, signal?: AbortSignal): Promise<Upload> {
  const { data: ticket, error } = await api.POST("/api/v1/uploads", { body: { filename: file.name, sizeBytes: file.size, license } });
  if (!ticket) throw problemMessage(error, "Could not start the upload.");
  const total = ticket.partCount ?? ticket.parts.length;

  const completed: { partNumber: number; etag: string }[] = [];
  let sent = 0;
  let page = ticket.parts;
  while (page.length > 0) {
    for (const part of page) {
      if (signal?.aborted) throw new Error("Upload cancelled.");
      const start = (part.partNumber - 1) * ticket.partSizeBytes;
      const blob = file.slice(start, Math.min(file.size, start + ticket.partSizeBytes));
      const etag = await putPart(part.url, blob, (loaded) => onProgress(Math.min(file.size, sent + loaded)), signal);
      sent += blob.size;
      onProgress(sent);
      completed.push({ partNumber: part.partNumber, etag });
    }
    const next = page[page.length - 1].partNumber + 1;
    page = next <= total ? await moreParts(ticket.upload.id, next) : [];
  }

  const { data: upload, error: completeError } = await api.POST("/api/v1/uploads/{id}/complete", {
    params: { path: { id: ticket.upload.id } },
    body: { parts: completed },
  });
  if (!upload) throw problemMessage(completeError, "The upload could not be finished.");
  return upload;
}

/** Attaches a sidecar subtitle file to a video that finished ingesting. */
export async function uploadSubtitle(videoId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  const { data, error } = await api.POST("/api/v1/videos/{id}/subtitles", {
    params: { path: { id: videoId } },
    body: body as unknown as { file: string },
    bodySerializer: (b) => b as unknown as FormData,
  });
  if (!data) throw problemMessage(error, "Could not add these subtitles.");
  return data;
}

/** "3.2 GB", "48.2 MB", "820 KB". */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

/** "about 6 min left", from bytes still to send and the recent rate. */
export function timeLeft(remainingBytes: number, bytesPerSecond: number): string | null {
  if (!(bytesPerSecond > 0) || remainingBytes <= 0) return null;
  const seconds = remainingBytes / bytesPerSecond;
  if (seconds < 60) return "less than a minute left";
  if (seconds < 3600) return `about ${Math.round(seconds / 60)} min left`;
  const hours = Math.floor(seconds / 3600);
  return `about ${hours} hr ${Math.round((seconds % 3600) / 60)} min left`;
}
