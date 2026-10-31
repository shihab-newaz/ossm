"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, FileAudio, FileText, FileVideo, FolderOpen, UploadCloud, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { api } from "@/api/client";
import { problemMessage } from "@/auth/session";
import {
  DEFAULT_LICENSE,
  LICENSES,
  filesFromDrop,
  formatBytes,
  kindOf,
  rejectionReason,
  subtitleStem,
  timeLeft,
  uploadFile,
  uploadSubtitle,
  videoStem,
  type FileKind,
  type License,
  type Upload,
} from "./uploader";

type Phase =
  | { phase: "waiting" }
  | { phase: "uploading"; sent: number; startedAt: number; at: number }
  | { phase: "ingesting"; uploadId: string }
  | { phase: "failed"; error: string };

type Item = { key: string; name: string; size: number; kind: Exclude<FileKind, "subtitle"> } & Phase;

type SubtitleItem = {
  key: string;
  name: string;
  file: File;
  /** The video item it belongs to. */
  parent: string;
  phase: "waiting" | "adding" | "added" | "failed";
  message?: string;
};

const TERMINAL = ["DONE", "FAILED", "DUPLICATE"];

export function UploadScreen() {
  const client = useQueryClient();
  const [items, setItems] = useState<Item[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  // Applies to files added after it is chosen.
  const [license, setLicense] = useState<License>(DEFAULT_LICENSE);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  // Files go one after another so a big batch does not saturate the connection.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const counter = useRef(0);
  const known = useRef<Item[]>([]);
  const cancels = useRef(new Map<string, AbortController>());
  // The latest subtitles, for callbacks; and which ones have been sent, so none is sent twice.
  const subtitlesNow = useRef<SubtitleItem[]>([]);
  const sentSubtitles = useRef(new Set<string>());
  useEffect(() => {
    subtitlesNow.current = subtitles;
  }, [subtitles]);

  // Folders are picked with webkitdirectory, which React does not know as a prop.
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);

  const patch = (key: string, next: Phase) =>
    setItems((all) => all.map((item) => (item.key === key ? ({ ...item, ...next } as Item) : item)));
  const patchSubtitle = (key: string, next: Partial<SubtitleItem>) =>
    setSubtitles((all) => all.map((s) => (s.key === key ? { ...s, ...next } : s)));

  function add(files: File[]) {
    const media: Item[] = [];
    const subs: File[] = [];
    const ignored: string[] = [];
    const queued: { item: Item; file: File }[] = [];

    for (const file of files) {
      const kind = kindOf(file.name);
      if (kind === null) {
        // Hidden files (.DS_Store, Thumbs.db) are not worth mentioning.
        if (!file.name.startsWith(".") && file.name !== "Thumbs.db" && file.name !== "desktop.ini") ignored.push(file.name);
        continue;
      }
      if (kind === "subtitle") {
        subs.push(file);
        continue;
      }
      const key = `${file.name}-${counter.current++}`;
      const rejected = rejectionReason(file);
      const item: Item = rejected ? { key, name: file.name, size: file.size, kind, phase: "failed", error: rejected } : { key, name: file.name, size: file.size, kind, phase: "waiting" };
      media.push(item);
      if (!rejected) queued.push({ item, file });
    }

    known.current = [...known.current, ...media];
    const matched: SubtitleItem[] = subs.map((file) => {
      const stem = subtitleStem(file.name);
      const video = known.current.find((i) => i.kind === "video" && videoStem(i.name) === stem);
      const key = `${file.name}-${counter.current++}`;
      return video
        ? { key, name: file.name, file, parent: video.key, phase: "waiting" }
        : { key, name: file.name, file, parent: "", phase: "failed", message: "No video with this name was uploaded with it." };
    });

    setItems((all) => [...all, ...media]);
    setSubtitles((all) => [...all, ...matched]);
    if (ignored.length > 0) setSkipped((all) => [...all, ...ignored]);

    for (const { item, file } of queued) {
      const controller = new AbortController();
      cancels.current.set(item.key, controller);
      chain.current = chain.current.then(async () => {
        if (controller.signal.aborted) return;
        const startedAt = Date.now();
        patch(item.key, { phase: "uploading", sent: 0, startedAt, at: startedAt });
        try {
          const upload = await uploadFile(file, license, (sent) => patch(item.key, { phase: "uploading", sent, startedAt, at: Date.now() }), controller.signal);
          patch(item.key, { phase: "ingesting", uploadId: upload.id });
        } catch (e) {
          patch(item.key, { phase: "failed", error: e instanceof Error ? e.message : "Upload failed." });
        } finally {
          cancels.current.delete(item.key);
        }
      });
    }
  }

  function cancel(key: string) {
    cancels.current.get(key)?.abort();
    patch(key, { phase: "failed", error: "Upload cancelled." });
  }

  /** Once a video is in the library, its sidecar subtitles follow it. */
  function videoFinished(itemKey: string, upload: Upload) {
    if (!upload.videoId) return;
    void client.invalidateQueries({ queryKey: ["videos"] });
    void client.invalidateQueries({ queryKey: ["shows"] });
    const videoId = upload.videoId;
    for (const sub of subtitlesNow.current.filter((s) => s.parent === itemKey && s.phase === "waiting")) {
      if (sentSubtitles.current.has(sub.key)) continue;
      sentSubtitles.current.add(sub.key);
      void (async () => {
        patchSubtitle(sub.key, { phase: "adding" });
        try {
          const added = await uploadSubtitle(videoId, sub.file);
          patchSubtitle(sub.key, { phase: "added", message: `${added.label} subtitles added` });
        } catch (e) {
          patchSubtitle(sub.key, { phase: "failed", message: e instanceof Error ? e.message : "Could not add these subtitles." });
        }
      })();
    }
  }

  function videoFailed(itemKey: string) {
    setSubtitles((all) => all.map((s) => (s.parent === itemKey && s.phase === "waiting" ? { ...s, phase: "failed", message: "The video did not upload." } : s)));
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    add(await filesFromDrop(event.dataTransfer.items, event.dataTransfer.files));
  }

  const orphanSubtitles = subtitles.filter((s) => s.parent === "");

  return (
    <div className="flex flex-col gap-6 py-8">
      <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">Upload</h1>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => void onDrop(e)}
        className={`flex flex-col items-center gap-2.5 rounded-banner border-2 border-dashed p-8 text-center ${dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-bg-subtle"}`}
      >
        <UploadCloud size={36} strokeWidth={1.75} aria-hidden className="text-fg-muted" />
        <p className="font-display text-xl font-bold">Drop music or video files here</p>
        <p className="max-w-[620px] text-[13px] leading-[18px] text-fg-muted [text-wrap:pretty]">
          Music: MP3, FLAC, M4A, OGG/Opus, WAV up to 250 MB. Video: MP4, M4V, MOV, WebM, MKV up to 20 GB. Add .srt or .vtt files with the same name for subtitles. You can drop a whole
          folder.
        </p>
        <div className="mt-1 flex items-center gap-2 text-[14px]">
          <label htmlFor="license" className="font-semibold">
            License
          </label>
          <select id="license" value={license} onChange={(e) => setLicense(e.target.value as License)} className="h-10 rounded-card border border-border-strong bg-surface px-3">
            {LICENSES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-1.5 flex flex-wrap justify-center gap-2">
          <button onClick={() => filesInput.current?.click()} className="h-10 rounded-full border border-border-strong bg-bg px-4 text-[15px] font-semibold hover:bg-surface-hover">
            Choose files
          </button>
          <button onClick={() => folderInput.current?.click()} className="flex h-10 items-center gap-2 rounded-full border border-border-strong bg-bg px-4 text-[15px] font-semibold hover:bg-surface-hover">
            <FolderOpen size={18} aria-hidden />
            Choose a folder
          </button>
        </div>
        <input
          ref={filesInput}
          type="file"
          multiple
          accept="audio/*,video/*,.mp3,.flac,.m4a,.ogg,.opus,.wav,.mp4,.m4v,.mov,.webm,.mkv,.srt,.vtt"
          aria-label="Music or video files"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <input
          ref={folderInput}
          type="file"
          multiple
          aria-label="A folder of music or videos"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {skipped.length > 0 ? (
        <p role="note" className="text-[13px] text-fg-muted">
          Skipped {skipped.length} {skipped.length === 1 ? "file that isn't" : "files that aren't"} music, video or subtitles ({skipped.slice(0, 3).join(", ")}
          {skipped.length > 3 ? ", …" : ""}).
        </p>
      ) : null}

      {items.length > 0 || orphanSubtitles.length > 0 ? (
        <ul aria-label="Uploads" className="flex flex-col">
          {items.map((item) => (
            <li key={item.key} className="border-b border-border">
              <Row item={item} onCancel={() => cancel(item.key)} onFinished={(u) => videoFinished(item.key, u)} onFailed={() => videoFailed(item.key)} />
              {subtitles
                .filter((s) => s.parent === item.key)
                .map((s) => (
                  <SubtitleRow key={s.key} item={s} />
                ))}
            </li>
          ))}
          {orphanSubtitles.map((s) => (
            <li key={s.key} className="border-b border-border">
              <SubtitleRow item={s} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Row({ item, onCancel, onFinished, onFailed }: { item: Item; onCancel: () => void; onFinished: (upload: Upload) => void; onFailed: () => void }) {
  const Icon = item.kind === "video" ? FileVideo : FileAudio;
  useEffect(() => {
    if (item.phase === "failed") onFailed();
    // Only when this row fails, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.phase]);

  return (
    <div className="flex min-h-14 items-center gap-4 py-2">
      <Icon size={20} aria-hidden className="shrink-0 text-fg-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-[15px] font-semibold">{item.name}</p>
        <Status item={item} onFinished={onFinished} />
      </div>
      {item.phase === "waiting" || item.phase === "uploading" ? (
        <button onClick={onCancel} aria-label={`Cancel ${item.name}`} className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-surface-hover">
          <X size={18} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function Status({ item, onFinished }: { item: Item; onFinished: (upload: Upload) => void }) {
  switch (item.phase) {
    case "waiting":
      return <p className="text-[13px] text-fg-muted">Waiting…</p>;
    case "uploading": {
      const percent = item.size > 0 ? Math.round((item.sent / item.size) * 100) : 0;
      const elapsed = (item.at - item.startedAt) / 1000;
      const left = elapsed > 2 ? timeLeft(item.size - item.sent, item.sent / elapsed) : null;
      return (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
          <span className="font-mono text-[12px] font-medium text-fg-muted">
            {formatBytes(item.sent)} of {formatBytes(item.size)}
            {left ? ` · ${left}` : ""}
          </span>
          <div
            role="progressbar"
            aria-label={`Uploading ${item.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1 overflow-hidden rounded-full bg-border-strong sm:ml-auto sm:w-60"
          >
            <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
        </div>
      );
    }
    case "ingesting":
      return <Ingest uploadId={item.uploadId} kind={item.kind} size={item.size} onFinished={onFinished} />;
    case "failed":
      return <Failed message={item.error} />;
  }
}

/** Follows the server-side job until it finishes, without a manual refresh. */
function Ingest({ uploadId, kind, size, onFinished }: { uploadId: string; kind: Item["kind"]; size: number; onFinished: (upload: Upload) => void }) {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ["upload", uploadId],
    queryFn: async (): Promise<Upload> => {
      const { data } = await api.GET("/api/v1/uploads/{id}", { params: { path: { id: uploadId } } });
      if (!data) throw new Error("Could not check on this upload.");
      return data;
    },
    refetchInterval: (query) => (query.state.data && TERMINAL.includes(query.state.data.status) ? false : 1500),
  });
  const retry = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/uploads/{id}/retry", { params: { path: { id: uploadId } } });
      if (!data) throw problemMessage(error, "Could not retry this upload.");
      return data;
    },
    onSuccess: (upload) => {
      client.setQueryData(["upload", uploadId], upload);
      // Polling stops once an upload is terminal; one fetch starts it again.
      void status.refetch();
    },
  });
  const upload = status.data;
  const settled = upload?.status === "DONE" || upload?.status === "DUPLICATE";
  useEffect(() => {
    if (!settled || !upload) return;
    if (kind === "audio") for (const key of ["tracks", "albums", "artists"]) void client.invalidateQueries({ queryKey: [key] });
    onFinished(upload);
    // Once, when the upload settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  const video = kind === "video";
  const where = video ? "videos" : "library";
  const link = video && upload?.videoId ? `/watch/${upload.videoId}` : "/library";
  const linkText = video ? "Watch" : "View library";

  if (upload?.status === "FAILED") {
    return (
      <div className="flex flex-col items-start gap-2">
        <Failed message={retry.error?.message ?? upload.error ?? "This file could not be processed."} />
        <button
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
          className="h-8 rounded-full border border-border-strong px-3.5 text-[13px] font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {retry.isPending ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }
  if (upload?.status === "DUPLICATE") {
    return (
      <p className="flex items-center gap-2 text-[13px] text-fg-muted">
        <Copy size={16} aria-hidden />
        Already in your {where}, so it was skipped.{" "}
        <Link href={link} className="text-accent underline">
          {linkText}
        </Link>
      </p>
    );
  }
  if (upload?.status === "DONE") {
    return (
      <p className="flex items-center gap-2 text-[13px] text-success">
        <CheckCircle2 size={16} aria-hidden />
        <span className="font-mono text-fg-muted">{formatBytes(size)}</span> Added to your {where}.{" "}
        <Link href={link} className="text-accent underline">
          {linkText}
        </Link>
      </p>
    );
  }
  return (
    <p role="status" className="font-mono text-[12px] text-fg-muted motion-safe:animate-pulse">
      Processing…
    </p>
  );
}

function SubtitleRow({ item }: { item: SubtitleItem }) {
  return (
    <div className={`flex min-h-12 items-center gap-4 py-2 ${item.parent ? "pl-9" : ""}`}>
      <FileText size={20} aria-hidden className="shrink-0 text-fg-subtle" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-[15px] font-semibold">{item.name}</p>
        {item.phase === "failed" ? (
          <Failed message={item.message ?? "Could not add these subtitles."} />
        ) : (
          <p className={`text-[13px] ${item.phase === "added" ? "text-success" : "text-fg-subtle"}`}>
            {item.phase === "waiting" ? "Waiting for video" : item.phase === "adding" ? "Adding subtitles…" : item.message}
          </p>
        )}
      </div>
    </div>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-[13px] text-danger">
      <XCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}
