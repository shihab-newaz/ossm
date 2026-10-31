import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { problemMessage } from "@/auth/session";

export type Video = components["schemas"]["Video"];
export type VideoDetail = components["schemas"]["VideoDetail"];
export type VideoUpdate = components["schemas"]["VideoUpdate"];
export type Show = components["schemas"]["Show"];
export type ShowDetail = components["schemas"]["ShowDetail"];
export type Subtitle = components["schemas"]["Subtitle"];
export type VideoSort = "added" | "title" | "year";

export const PAGE_SIZE = 120;
export const SECTION_LIMIT = 12;

export const videoStreamUrl = (id: string) => `/api/v1/videos/${id}/stream`;

type Page<T> = { items: T[]; total: number; offset: number };

function page<T>(items: T[], response: Response, offset: number): Page<T> {
  const header = response.headers.get("X-Total-Count");
  const total = Number(header);
  return { items, offset, total: header !== null && Number.isFinite(total) ? total : offset + items.length };
}

function usePaged<T>(key: unknown[], load: (offset: number) => Promise<Page<T>>) {
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    retry: 1,
    retryDelay: 250,
    queryFn: ({ pageParam }) => load(pageParam),
    getNextPageParam: (last) => {
      const next = last.offset + PAGE_SIZE;
      return last.items.length === PAGE_SIZE && next < last.total ? next : undefined;
    },
  });
  const pages = query.data?.pages ?? [];
  return { items: pages.flatMap((p) => p.items), total: pages.length > 0 ? pages[pages.length - 1].total : 0, query };
}

export function useMoviePages(sort: VideoSort) {
  return usePaged<Video>(["videos", "movies", sort], async (offset) => {
    const { data, response } = await api.GET("/api/v1/videos", { params: { query: { kind: "MOVIE", sort, limit: PAGE_SIZE, offset } } });
    if (!data) throw new Error("Could not load your videos.");
    return page(data, response, offset);
  });
}

export function useShowPages(sort: VideoSort) {
  return usePaged<Show>(["shows", "pages", sort], async (offset) => {
    const { data, response } = await api.GET("/api/v1/shows", { params: { query: { sort, limit: PAGE_SIZE, offset } } });
    if (!data) throw new Error("Could not load your shows.");
    return page(data, response, offset);
  });
}

/** Every show's name, for the show picker when editing an episode. */
export function useShowNames() {
  return useQuery({
    queryKey: ["shows", "names"],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/shows", { params: { query: { sort: "title" } } });
      return (data ?? []).map((s) => s.name);
    },
  });
}

export function useVideo(id: string) {
  return useQuery({
    queryKey: ["videos", "detail", id],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/v1/videos/{id}", { params: { path: { id } } });
      if (!data) throw new Error(response.status === 404 ? "not-found" : "Could not load this video.");
      return data;
    },
    retry: false,
    // Progress changes while watching; coming back to the page should start from the new position.
    staleTime: 0,
  });
}

export function useShow(id: string) {
  return useQuery({
    queryKey: ["shows", "detail", id],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/v1/shows/{id}", { params: { path: { id } } });
      if (!data) throw new Error(response.status === 404 ? "not-found" : "Could not load this show.");
      return data;
    },
    retry: false,
  });
}

export function useRecentVideos() {
  return useQuery({
    queryKey: ["videos", "recent"],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/videos/recent", { params: { query: { limit: SECTION_LIMIT } } });
      if (!data) throw new Error("recent videos");
      return data;
    },
  });
}

export function useContinueWatching() {
  return useQuery({
    queryKey: ["videos", "continue-watching"],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/videos/continue-watching", { params: { query: { limit: SECTION_LIMIT } } });
      if (!data) throw new Error("continue watching");
      return data;
    },
  });
}

/** Saves where someone is in a video. Never throws: progress must not interrupt playback. */
export async function saveProgress(id: string, positionMs: number, durationMs: number, keepalive = false) {
  await api.PUT("/api/v1/videos/{id}/progress", { params: { path: { id } }, body: { positionMs, durationMs }, keepalive });
}

export function useUpdateVideo(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (update: VideoUpdate) => {
      const { data, error } = await api.PATCH("/api/v1/videos/{id}", { params: { path: { id } }, body: update });
      if (!data) throw problemMessage(error, "Could not save the details. Try again.");
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["videos"] });
      void client.invalidateQueries({ queryKey: ["shows"] });
    },
  });
}

export function useAddSubtitle(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      const { data, error } = await api.POST("/api/v1/videos/{id}/subtitles", {
        params: { path: { id } },
        // The browser sets the multipart boundary itself.
        body: body as unknown as { file: string },
        bodySerializer: (b) => b as unknown as FormData,
      });
      if (!data) throw problemMessage(error, "Could not add the subtitles.");
      return data;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["videos", "detail", id] }),
  });
}
