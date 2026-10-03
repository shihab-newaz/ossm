"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, UploadCloud, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { api } from "@/api/client";
import { rejectionReason, uploadFile, type Upload } from "./uploader";

type Item =
  | { key: string; name: string; phase: "waiting" }
  | { key: string; name: string; phase: "uploading"; progress: number }
  | { key: string; name: string; phase: "ingesting"; uploadId: string }
  | { key: string; name: string; phase: "failed"; error: string };

const TERMINAL = ["DONE", "FAILED"];

export function UploadScreen() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Files go one after another so a big batch does not saturate the connection.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const counter = useRef(0);

  const patch = (key: string, next: Item) => setItems((all) => all.map((item) => (item.key === key ? next : item)));

  function add(files: File[]) {
    for (const file of files) {
      const key = `${file.name}-${counter.current++}`;
      const rejected = rejectionReason(file);
      if (rejected) {
        setItems((all) => [...all, { key, name: file.name, phase: "failed", error: rejected }]);
        continue;
      }
      setItems((all) => [...all, { key, name: file.name, phase: "waiting" }]);
      chain.current = chain.current.then(async () => {
        patch(key, { key, name: file.name, phase: "uploading", progress: 0 });
        try {
          const upload = await uploadFile(file, (progress) => patch(key, { key, name: file.name, phase: "uploading", progress }));
          patch(key, { key, name: file.name, phase: "ingesting", uploadId: upload.id });
        } catch (e) {
          patch(key, { key, name: file.name, phase: "failed", error: e instanceof Error ? e.message : "Upload failed." });
        }
      });
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    add(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="flex flex-col gap-8 py-8">
      <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">Upload</h1>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-banner border-2 border-dashed px-6 py-12 text-center ${
          dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-bg-subtle"
        }`}
      >
        <UploadCloud size={40} aria-hidden className="text-fg-subtle" />
        <p className="font-display text-xl font-bold">Drop music here</p>
        <p className="text-fg-muted">MP3 files up to 250 MB each.</p>
        <button
          onClick={() => input.current?.click()}
          className="h-11 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent hover:bg-accent-hover active:scale-[0.97]"
        >
          Choose files
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept="audio/*,.mp3"
          aria-label="Audio files"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {items.length > 0 ? (
        <ul aria-label="Uploads" className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.key} className="flex flex-col gap-2 rounded-card border border-border p-4">
              <p className="truncate font-semibold">{item.name}</p>
              <Status item={item} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Status({ item }: { item: Item }) {
  switch (item.phase) {
    case "waiting":
      return <p className="text-fg-muted">Waiting…</p>;
    case "uploading": {
      const percent = Math.round(item.progress * 100);
      return (
        <div className="flex items-center gap-3">
          <div role="progressbar" aria-label={`Uploading ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1 flex-1 overflow-hidden rounded-full bg-bg-subtle">
            <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
          <span className="w-10 text-right font-mono text-[12px] text-fg-muted">{percent}%</span>
        </div>
      );
    }
    case "ingesting":
      return <Ingest uploadId={item.uploadId} />;
    case "failed":
      return <Failed message={item.error} />;
  }
}

/** Follows the server-side job until it finishes, without a manual refresh. */
function Ingest({ uploadId }: { uploadId: string }) {
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
  const finished = status.data?.status === "DONE";
  useEffect(() => {
    if (finished) void client.invalidateQueries({ queryKey: ["tracks"] });
  }, [finished, client]);

  if (status.data?.status === "FAILED") return <Failed message={status.data.error ?? "This file could not be processed."} />;
  if (finished) {
    return (
      <p className="flex items-center gap-2 text-success">
        <CheckCircle2 size={18} aria-hidden />
        Added to your library.{" "}
        <Link href="/library" className="text-accent underline">
          View library
        </Link>
      </p>
    );
  }
  return (
    <p role="status" className="text-fg-muted motion-safe:animate-pulse">
      Processing…
    </p>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-danger">
      <XCircle size={18} aria-hidden className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}
