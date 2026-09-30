"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function HealthIndicator() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/health");
      if (error || !data) throw new Error("health check failed");
      return data;
    },
    refetchInterval: 30_000,
  });

  let label = "Checking API";
  let dot = "bg-fg-subtle";
  if (!isPending && (isError || !data)) {
    label = "API unreachable";
    dot = "bg-danger";
  } else if (data) {
    const healthy = data.status === "UP" && data.database === "UP";
    label = healthy ? "API connected" : "API up, database down";
    dot = healthy ? "bg-success" : "bg-danger";
  }

  return (
    <p role="status" className="flex items-center gap-2 font-mono text-[12px] font-medium text-fg-muted">
      <span aria-hidden className={`size-2 rounded-full ${dot}`} />
      {label}
    </p>
  );
}
