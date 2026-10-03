"use client";

import { ArrowDown, ArrowUp, Music, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { player, usePlayer, type QueueItem } from "./player";

/** The queue: what is playing and what comes next, in play order. Reorder with the arrows, remove with the cross. */
export function QueueDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { queue, index, shuffle } = usePlayer();
  const now = queue[index];
  const upcoming = queue.slice(index + 1);

  return (
    <Modal open={open} onClose={onClose} title="Queue" variant="drawer">
      {now ? (
        <section aria-label="Now playing" className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Now playing</h3>
          <Entry item={now} current />
        </section>
      ) : null}
      <section aria-label="Next up" className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Next up{shuffle ? " (shuffled)" : ""}</h3>
        {upcoming.length === 0 ? (
          <p className="text-fg-muted">Nothing queued. Use “Add to queue” or “Play next” on a track.</p>
        ) : (
          <ul className="flex flex-col">
            {upcoming.map((item, i) => (
              <li key={item.qid}>
                <Entry item={item} position={index + 1 + i} first={i === 0} last={i === upcoming.length - 1} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}

function Entry({ item, current, position = 0, first, last }: { item: QueueItem; current?: boolean; position?: number; first?: boolean; last?: boolean }) {
  const { track } = item;
  const button = "grid size-9 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-30";
  return (
    <div className="flex items-center gap-2 rounded-card px-1 py-1 hover:bg-surface-hover">
      <button
        onClick={() => void player.jump(item.qid)}
        aria-label={`Play ${track.title}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-card text-left"
      >
        {track.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authenticated cover art
          <img src={track.coverUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
        ) : (
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-bg-subtle text-fg-subtle">
            <Music size={18} />
          </span>
        )}
        <span className="min-w-0">
          <span className={`block truncate font-semibold ${current ? "text-accent" : ""}`}>{track.title}</span>
          <span className="block truncate text-[13px] text-fg-muted">{track.artist}</span>
        </span>
      </button>
      {current ? null : (
        <>
          <button onClick={() => player.move(position, position - 1)} disabled={first} aria-label={`Move ${track.title} up`} className={button}>
            <ArrowUp size={18} aria-hidden />
          </button>
          <button onClick={() => player.move(position, position + 1)} disabled={last} aria-label={`Move ${track.title} down`} className={button}>
            <ArrowDown size={18} aria-hidden />
          </button>
          <button onClick={() => void player.removeAt(item.qid)} aria-label={`Remove ${track.title} from queue`} className={button}>
            <X size={18} aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
