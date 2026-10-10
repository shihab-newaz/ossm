import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/schema";

export type SearchResults = components["schemas"]["SearchResults"];

/** Hits for `q`, grouped. Nothing is asked until there is something to look for; the last answer stays up while the next loads. */
export function useSearch(q: string, limit: number) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: ["search", trimmed, limit],
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
    // One quick retry for a blip, then say so, rather than minutes of backoff behind a skeleton.
    retry: 1,
    retryDelay: 250,
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/search", { params: { query: { q: trimmed, limit } } });
      if (!data) throw new Error("Search is not available right now.");
      return data;
    },
  });
}

/** Where the top result lives: its group says which, and its id picks the item. */
export function topResult(results: SearchResults) {
  const { top } = results;
  if (!top) return null;
  if (top.type === "track") return { kind: "track" as const, item: results.tracks.find((t) => t.id === top.id) };
  if (top.type === "album") return { kind: "album" as const, item: results.albums.find((a) => a.id === top.id) };
  return { kind: "artist" as const, item: results.artists.find((a) => a.id === top.id) };
}

export const isEmpty = (results: SearchResults) => results.tracks.length + results.albums.length + results.artists.length === 0;
