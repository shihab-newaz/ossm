"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { meKey, problemMessage } from "./session";

export function useChangePassword() {
  return useMutation({
    mutationFn: async (passwords: { currentPassword: string; newPassword: string }) => {
      const { response, error } = await api.POST("/api/v1/auth/password", { body: passwords });
      if (!response.ok) throw problemMessage(error, "Could not change your password.");
    },
  });
}

/** Whether an invite token is still usable, and for whom. 404 means used, expired or unknown. */
export function useInvite(token: string) {
  return useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/v1/invites/{token}", { params: { path: { token } } });
      if (response.status === 404) return null;
      if (!data) throw new Error("Could not reach the server");
      return data;
    },
    retry: false,
  });
}

export function useAcceptInvite(token: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (password: string) => {
      const { data, error } = await api.POST("/api/v1/invites/{token}/accept", {
        params: { path: { token } },
        body: { password },
      });
      if (!data) throw problemMessage(error, "Could not set your password. Try again.");
      return data;
    },
    onSuccess: (user) => client.setQueryData(meKey, user),
  });
}
