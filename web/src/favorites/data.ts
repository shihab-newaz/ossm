import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { toast } from "@/components/ui/toast";
import { PAGE_SIZE, page, usePaged } from "@/library/data";

type Track = components["schemas"]["Track"];
export type Play = components["schemas"]["Play"];

/**
 * Which tracks the user has liked. One small list, kept once, that every like button reads, so a like
 * made anywhere shows everywhere at once and no track list has to carry its own copy.
 */
export const favoriteIdsKey = ["favorites", "ids"] as const;
/** Everything else about favorites, so one invalidation refreshes every list of them. */
const favoriteListsKey = ["favorites", "list"] as const;

const toSet = (ids: string[]) => new Set(ids);

export function useIsLiked(trackId: string): boolean {
  const { data } = useQuery({
    queryKey: favoriteIdsKey,
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/favorites/ids");
      if (!data) throw new Error("Could not load your likes.");
      return data;
    },
    select: toSet,
    // A failed load just shows nothing as liked; it is not worth a skeleton or a retry storm.
    retry: 1,
    retryDelay: 250,
  });
  return data?.has(trackId) ?? false;
}

type Like = { id: string; title: string; like: boolean };

/**
 * Likes or unlikes a track. The heart changes at once; if the server refuses, it changes back and
 * says so. With no `like` given, it flips whatever the track is right now.
 */
export function useToggleLike() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ id, like }: Like) => {
      const params = { params: { path: { trackId: id } } };
      const { response } = like ? await api.PUT("/api/v1/favorites/{trackId}", params) : await api.DELETE("/api/v1/favorites/{trackId}", params);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    onMutate: async ({ id, like }) => {
      // An answer to an earlier question must not land on top of this change.
      await client.cancelQueries({ queryKey: favoriteIdsKey });
      const previous = client.getQueryData<string[]>(favoriteIdsKey);
      client.setQueryData<string[]>(favoriteIdsKey, (ids = []) => (like ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((x) => x !== id)));
      return { previous };
    },
    onError: (_error, { title, like }, context) => {
      client.setQueryData(favoriteIdsKey, context?.previous);
      toast.error(`Could not ${like ? "like" : "unlike"} “${title}”.`);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: favoriteIdsKey });
      void client.invalidateQueries({ queryKey: favoriteListsKey });
    },
  });

  return (track: { id: string; title: string }, like?: boolean) => {
    const liked = client.getQueryData<string[]>(favoriteIdsKey)?.includes(track.id) ?? false;
    mutation.mutate({ id: track.id, title: track.title, like: like ?? !liked });
  };
}

/** The Liked page: the user's likes, most recently liked first. */
export function useFavoritePages() {
  return usePaged<Track>([...favoriteListsKey, "pages"], async (offset) => {
    const { data, response } = await api.GET("/api/v1/favorites", { params: { query: { limit: PAGE_SIZE, offset } } });
    if (!data) throw new Error("Could not load your likes.");
    return page(data, response, offset);
  });
}

/** Every liked track in this order, for "Play all" and for starting from a row when not everything is loaded yet. */
export async function fetchAllFavorites(client: QueryClient): Promise<Track[]> {
  return client.fetchQuery({
    queryKey: [...favoriteListsKey, "all"],
    staleTime: 10_000,
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/favorites");
      if (!data) throw new Error("Could not load your likes.");
      return data;
    },
  });
}

/** The History page: qualifying plays, most recent first. A track played twice is two entries. */
export function useHistoryPages() {
  return usePaged<Play>(["history", "pages"], async (offset) => {
    const { data, response } = await api.GET("/api/v1/history", { params: { query: { limit: PAGE_SIZE, offset } } });
    if (!data) throw new Error("Could not load your history.");
    return page(data, response, offset);
  });
}
