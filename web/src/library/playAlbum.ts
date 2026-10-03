import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { toast } from "@/components/ui/toast";
import { player } from "@/player/player";

/** Starts an album from its first track (or shuffled), loading its track list if it is not already known. */
export async function playAlbum(client: QueryClient, id: string, opts?: { shuffle?: boolean; randomStart?: boolean }) {
  try {
    const detail = await client.fetchQuery({
      queryKey: ["albums", "detail", id],
      staleTime: 30_000,
      queryFn: async () => {
        const { data } = await api.GET("/api/v1/albums/{id}", { params: { path: { id } } });
        if (!data) throw new Error("album");
        return data;
      },
    });
    if (detail.tracks.length > 0) void player.playList(detail.tracks, 0, opts);
  } catch {
    toast.error("Could not load that album.");
  }
}
