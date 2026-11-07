"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { problemMessage } from "@/auth/session";
import { rejectionReason, uploadFile, type License, type Upload, type UploadKind } from "./uploader";

type Item =
  | { key: string; name: string; phase: "waiting" }
  | { key: string; name: string; phase: "uploading"; progress: number }
  | { key: string; name: string; phase: "ingesting"; uploadId: string }
  | { key: string; name: string; phase: "failed"; error: string };

const TERMINAL = ["DONE", "FAILED", "DUPLICATE"];

/** What an upload becomes, in the words of the place it goes: the music library or the video vault. */
const WHERE: Record<UploadKind, { done: string; duplicate: string; link?: { href: string; label: string }; stale: string[] }> = {
  AUDIO: {
    done: "Added to your library.",
    duplicate: "Already in your library, so it was skipped.",
    link: { href: "/library", label: "View library" },
    stale: ["tracks", "albums", "artists"],
  },
  VIDEO: {
    done: "Added to your vault.",
    duplicate: "Already in your vault, so it was skipped.",
    stale: ["videos"],
  },
};

/**
 * The files being uploaded on one screen. Files go one after another so a big batch does not
 * saturate the connection; each one shows its own progress, then follows ingest to the end.
 */
export function useUploadQueue(kind: UploadKind) {
  const [items, setItems] = useState<Item[]>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const counter = useRef(0);

  const add = useCallback(
    (files: File[], license?: License) => {
      const patch = (key: string, next: Item) => setItems((all) => all.map((item) => (item.key === key ? next : item)));
      for (const file of files) {
        const key = `${file.name}-${counter.current++}`;
        const rejected = rejectionReason(file, kind);
        if (rejected) {
          setItems((all) => [...all, { key, name: file.name, phase: "failed", error: rejected }]);
          continue;
        }
        setItems((all) => [...all, { key, name: file.name, phase: "waiting" }]);
        chain.current = chain.current.then(async () => {
          patch(key, { key, name: file.name, phase: "uploading", progress: 0 });
          try {
            const upload = await uploadFile(file, { kind, license }, (progress) => patch(key, { key, name: file.name, phase: "uploading", progress }));
            patch(key, { key, name: file.name, phase: "ingesting", uploadId: upload.id });
          } catch (e) {
            patch(key, { key, name: file.name, phase: "failed", error: e instanceof Error ? e.message : "Upload failed." });
          }
        });
      }
    },
    [kind],
  );

  return { items, add };
}

export function UploadList({ items, kind }: { items: Item[]; kind: UploadKind }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label="Uploads" className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.key} className="flex flex-col gap-2 rounded-card border border-border p-4">
          <p className="truncate font-semibold">{item.name}</p>
          <Status item={item} kind={kind} />
        </li>
      ))}
    </ul>
  );
}

function Status({ item, kind }: { item: Item; kind: UploadKind }) {
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
      return <Ingest uploadId={item.uploadId} kind={kind} />;
    case "failed":
      return <Failed message={item.error} />;
  }
}

/** Follows the server-side job until it finishes, without a manual refresh. */
function Ingest({ uploadId, kind }: { uploadId: string; kind: UploadKind }) {
  const client = useQueryClient();
  const where = WHERE[kind];
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
  const finished = status.data?.status === "DONE";
  useEffect(() => {
    if (finished) for (const key of where.stale) void client.invalidateQueries({ queryKey: [key] });
  }, [finished, client, where]);

  if (status.data?.status === "FAILED") {
    return (
      <div className="flex flex-col items-start gap-2">
        <Failed message={retry.error?.message ?? status.data.error ?? "This file could not be processed."} />
        <button
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
          className="h-9 rounded-full border border-border-strong px-4 text-[14px] font-semibold hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {retry.isPending ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }
  if (status.data?.status === "DUPLICATE") {
    return (
      <p className="flex items-center gap-2 text-fg-muted">
        <Copy size={18} aria-hidden />
        {where.duplicate} <ViewLink link={where.link} />
      </p>
    );
  }
  if (finished) {
    return (
      <p className="flex items-center gap-2 text-success">
        <CheckCircle2 size={18} aria-hidden />
        {where.done} <ViewLink link={where.link} />
      </p>
    );
  }
  return (
    <p role="status" className="text-fg-muted motion-safe:animate-pulse">
      Processing…
    </p>
  );
}

function ViewLink({ link }: { link?: { href: string; label: string } }) {
  return link ? (
    <Link href={link.href} className="text-accent underline">
      {link.label}
    </Link>
  ) : null;
}

function Failed({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-danger">
      <XCircle size={18} aria-hidden className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}
