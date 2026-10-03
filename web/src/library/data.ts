import { useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/schema";

export type Track = components["schemas"]["Track"];
export type Album = components["schemas"]["Album"];
export type Artist = components["schemas"]["Artist"];
export type Sort = "added" | "title" | "artist";

export const PAGE_SIZE = 200;

type Page<T> = { items: T[]; total: number; offset: number };

/** The total comes in a header. A server that does not send it is treated as having just this page. */
function page<T>(items: T[], response: Response, offset: number): Page<T> {
  const total = Number(response.headers.get("X-Total-Count"));
  return { items, offset, total: Number.isFinite(total) && response.headers.has("X-Total-Count") ? total : offset + items.length };
}

function usePaged<T>(key: unknown[], load: (offset: number) => Promise<Page<T>>) {
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    // One quick retry for a blip, then say so, rather than minutes of backoff behind a skeleton.
    retry: 1,
    retryDelay: 250,
    queryFn: ({ pageParam }) => load(pageParam),
    getNextPageParam: (last) => {
      const next = last.offset + PAGE_SIZE;
      return last.items.length === PAGE_SIZE && next < last.total ? next : undefined;
    },
  });
  const pages = query.data?.pages ?? [];
  return {
    items: pages.flatMap((p) => p.items),
    total: pages.length > 0 ? pages[pages.length - 1].total : 0,
    query,
  };
}

export function useTrackPages(sort: Sort, genre?: string) {
  return usePaged<Track>(["tracks", "pages", sort, genre ?? null], async (offset) => {
    const { data, response } = await api.GET("/api/v1/tracks", { params: { query: { limit: PAGE_SIZE, offset, sort, genre } } });
    if (!data) throw new Error("Could not load your library.");
    return page(data, response, offset);
  });
}

export function useAlbumPages(sort: Sort) {
  return usePaged<Album>(["albums", "pages", sort], async (offset) => {
    const { data, response } = await api.GET("/api/v1/albums", { params: { query: { limit: PAGE_SIZE, offset, sort } } });
    if (!data) throw new Error("Could not load your albums.");
    return page(data, response, offset);
  });
}

export function useArtistPages() {
  return usePaged<Artist>(["artists", "pages"], async (offset) => {
    const { data, response } = await api.GET("/api/v1/artists", { params: { query: { limit: PAGE_SIZE, offset } } });
    if (!data) throw new Error("Could not load your artists.");
    return page(data, response, offset);
  });
}

/** Every track in this order, for "Play all" and for starting from a row when not everything is loaded yet. */
export async function fetchAllTracks(client: QueryClient, sort: Sort, genre?: string): Promise<Track[]> {
  return client.fetchQuery({
    queryKey: ["tracks", "all", sort, genre ?? null],
    staleTime: 10_000,
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/tracks", { params: { query: { sort, genre } } });
      if (!data) throw new Error("Could not load your library.");
      return data;
    },
  });
}

export function useAlbum(id: string) {
  return useQuery({
    queryKey: ["albums", "detail", id],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/v1/albums/{id}", { params: { path: { id } } });
      if (!data) throw new Error(response.status === 404 ? "not-found" : "Could not load this album.");
      return data;
    },
    retry: false,
  });
}

export function useArtist(id: string) {
  return useQuery({
    queryKey: ["artists", "detail", id],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/v1/artists/{id}", { params: { path: { id } } });
      if (!data) throw new Error(response.status === 404 ? "not-found" : "Could not load this artist.");
      return data;
    },
    retry: false,
  });
}
