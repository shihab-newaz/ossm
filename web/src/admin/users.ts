"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { problemMessage } from "@/auth/session";

export type UserSummary = components["schemas"]["UserSummary"];
export type InviteCreated = components["schemas"]["InviteCreated"];
type Role = components["schemas"]["CreateUserRequest"]["role"];

const usersKey = ["users"] as const;

export function useUsers() {
  return useQuery({
    queryKey: usersKey,
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/users");
      if (!data) throw new Error("Could not load users");
      return data;
    },
  });
}

export function useCreateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (person: { username: string; role: Role }) => {
      const { data, error } = await api.POST("/api/v1/users", { body: person });
      if (!data) throw problemMessage(error, "Could not create the invite. Try again.");
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useReissueInvite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST("/api/v1/users/{id}/invite", { params: { path: { id } } });
      if (!data) throw problemMessage(error, "Could not create a new invite link.");
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useSetActive() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const path = active ? "/api/v1/users/{id}/activate" : "/api/v1/users/{id}/deactivate";
      const { response, error } = await api.POST(path, { params: { path: { id } } });
      if (!response.ok) throw problemMessage(error as components["schemas"]["Problem"] | undefined, "Could not update the user.");
    },
    onSuccess: () => client.invalidateQueries({ queryKey: usersKey }),
  });
}
