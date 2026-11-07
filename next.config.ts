import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Schlankes Docker-Image: .next/standalone enthält alles, was der Server braucht
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
