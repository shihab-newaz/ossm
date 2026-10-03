"use client";

import { useEffect } from "react";
import { player } from "@/player/player";
import { createListenTracker } from "./listens";
import { reporter } from "./reporter";

/** Reports what the player plays to the API as playback events. Renders nothing. */
export function PlaybackEvents() {
  useEffect(() => {
    const tracker = createListenTracker((event) => void reporter.record(event));
    tracker.update(player.getState());
    const unsubscribe = player.subscribe(() => tracker.update(player.getState()));
    // Events left over from a dropped connection or a reload.
    void reporter.flush();
    return unsubscribe;
  }, []);
  return null;
}
