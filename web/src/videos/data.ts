import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/schema";

export type Video = components["schemas"]["Video"];

export const VIDEO_PAGE_SIZE = 24;

/** The signed-in user's vault, newest first, one cursor page at a time. */
export function useVideoPages() {
  const query = useInfiniteQuery({
    queryKey: ["videos", "pages"],
    initialPageParam: undefined as string | undefined,
    // One quick retry for a blip, then say so, rather than minutes of backoff behind a skeleton.
    retry: 1,
    retryDelay: 250,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.GET("/api/v1/videos", { params: { query: { limit: VIDEO_PAGE_SIZE, cursor: pageParam } } });
      if (!data) throw new Error("Could not load your videos.");
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return { videos: query.data?.pages.flatMap((p) => p.items) ?? [], query };
}

export const videoStreamUrl = (id: string) => `/api/v1/videos/${id}/stream`;
export const videoDownloadUrl = (id: string) => `/api/v1/videos/${id}/download`;

/** One video of the signed-in user. Someone else's video is "not-found", the same as a missing one. */
export function useVideo(id: string) {
  return useQuery({
    queryKey: ["videos", "detail", id],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/v1/videos/{id}", { params: { path: { id } } });
      if (!data) throw new Error(response.status === 404 ? "not-found" : "Could not load this video.");
      return data;
    },
    retry: false,
  });
}
