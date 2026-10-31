"use client";

import { useId, useState, type FormEvent } from "react";
import { Field, FormError, PrimaryButton } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/toast";
import { useShowNames, useUpdateVideo, type Video } from "./data";

type Kind = Video["kind"];

const toNumber = (value: string) => (value.trim() === "" ? undefined : Number(value));

/** Corrects a misread filename: a movie's title and year, or which show, season and episode it is. */
export function EditDetailsDialog({ video, open, onClose }: { video: Video; open: boolean; onClose: () => void }) {
  const update = useUpdateVideo(video.id);
  const shows = useShowNames();
  const ids = useId();
  const [kind, setKind] = useState<Kind>(video.kind);
  const [title, setTitle] = useState(video.title);
  const [year, setYear] = useState(video.year?.toString() ?? "");
  const [showName, setShowName] = useState(video.showName ?? "");
  const [season, setSeason] = useState(video.season?.toString() ?? "");
  const [episode, setEpisode] = useState(video.episode?.toString() ?? "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await update.mutateAsync(
        kind === "MOVIE"
          ? { kind, title: title.trim(), year: toNumber(year) }
          : { kind, title: title.trim(), showName: showName.trim(), season: toNumber(season), episode: toNumber(episode) },
      );
      toast.info("Details saved.");
      onClose();
    } catch {
      // The message is shown in the form.
    }
  }

  const known = shows.data ?? [];
  const isNewShow = kind === "EPISODE" && showName.trim() !== "" && !known.some((n) => n.toLowerCase() === showName.trim().toLowerCase());

  return (
    <Modal open={open} onClose={onClose} title="Edit details" variant="dialog">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div role="radiogroup" aria-label="Kind" className="inline-flex gap-1 self-start rounded-full bg-bg-subtle p-1">
          {(["MOVIE", "EPISODE"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className="h-8 rounded-full px-4 text-[13px] font-semibold text-fg-muted aria-checked:bg-fg aria-checked:text-bg"
            >
              {k === "MOVIE" ? "Movie" : "Episode"}
            </button>
          ))}
        </div>

        {kind === "EPISODE" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Field id={`${ids}-show`} label="Show" value={showName} onChange={(e) => setShowName(e.target.value)} list={`${ids}-shows`} required autoComplete="off" />
              <datalist id={`${ids}-shows`}>
                {known.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {isNewShow ? <p className="text-[12px] text-fg-subtle">A new show called &lsquo;{showName.trim()}&rsquo; will be created.</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field id={`${ids}-season`} label="Season" type="number" inputMode="numeric" min={0} value={season} onChange={(e) => setSeason(e.target.value)} required />
              <Field id={`${ids}-episode`} label="Episode" type="number" inputMode="numeric" min={0} value={episode} onChange={(e) => setEpisode(e.target.value)} required />
            </div>
            <Field id={`${ids}-title`} label="Episode title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </>
        ) : (
          <>
            <Field id={`${ids}-title`} label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <Field id={`${ids}-year`} label="Year" type="number" inputMode="numeric" min={1870} max={2100} value={year} onChange={(e) => setYear(e.target.value)} />
          </>
        )}

        {update.isError ? <FormError>{update.error.message}</FormError> : null}

        <div className="mt-1 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="h-10 rounded-full border border-border-strong px-4 text-[15px] font-semibold hover:bg-surface-hover">
            Cancel
          </button>
          <PrimaryButton type="submit" disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
