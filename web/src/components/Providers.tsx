"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { setUnauthorizedHandler } from "@/api/client";
import { meKey } from "@/auth/session";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
  // When any request comes back 401 the session is over: forget the user so the gate sends them to login.
  useEffect(() => {
    setUnauthorizedHandler(() => client.setQueryData(meKey, null));
    return () => setUnauthorizedHandler(undefined);
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
