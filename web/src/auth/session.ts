"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/schema";

export type User = components["schemas"]["User"];
type Problem = components["schemas"]["Problem"];

export const meKey = ["auth", "me"] as const;
export const setupKey = ["auth", "setup"] as const;

/** An error whose message is safe and useful to show to the person. */
export class ProblemError extends Error {}

export const problemMessage = (problem: Problem | undefined, fallback: string) => new ProblemError(problem?.detail || fallback);

/** The logged-in user, or null when there is no session. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async (): Promise<User | null> => {
      const { data, response } = await api.GET("/api/v1/auth/me");
      if (response.status === 401) return null;
      if (!data) throw new Error("Could not load your account");
      return data;
    },
    retry: false,
  });
}

export function useSetupStatus(enabled = true) {
  return useQuery({
    queryKey: setupKey,
    enabled,
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/setup");
      if (!data) throw new Error("Could not reach the server");
      return data;
    },
    retry: false,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const { data, error } = await api.POST("/api/v1/auth/login", { body: credentials });
      if (!data) throw problemMessage(error, "Could not log in. Try again.");
      return data;
    },
    onSuccess: (user) => client.setQueryData(meKey, user),
  });
}

export function useSetup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (account: { username: string; password: string }) => {
      const { data, error } = await api.POST("/api/v1/setup", { body: account });
      if (!data) throw problemMessage(error, "Could not finish setup. Try again.");
      return data;
    },
    onSuccess: (user) => {
      client.setQueryData(setupKey, { setupRequired: false });
      client.setQueryData(meKey, user);
    },
  });
}

// Set when the person chose to log out, so the gate sends them to a plain /login instead of
// remembering the page they just left.
let leftOnPurpose = false;
export const consumeLoggedOutOnPurpose = () => {
  const was = leftOnPurpose;
  leftOnPurpose = false;
  return was;
};

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.POST("/api/v1/auth/logout");
    },
    onSuccess: () => {
      leftOnPurpose = true;
      client.setQueryData(meKey, null);
    },
  });
}

/** Only same-site paths are valid places to return to after login; anything else is dropped. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.startsWith("/login") || next.startsWith("/setup")) return "/";
  return next;
}
