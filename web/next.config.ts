import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Caddy routes /api to the backend in the compose stack. This keeps `pnpm dev` same-origin too.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_ORIGIN ?? "http://localhost:8080"}/api/:path*` }];
  },
};

export default nextConfig;
