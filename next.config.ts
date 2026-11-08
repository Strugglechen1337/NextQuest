import type { NextConfig } from "next";

const demo = process.env.NEXT_PUBLIC_DEMO === "1";

const nextConfig: NextConfig = {
  // Schlankes Docker-Image: .next/standalone enthält alles, was der Server braucht
  output: demo ? "export" : "standalone",
  ...(demo ? { basePath: "/NextQuest", trailingSlash: true, pageExtensions: ["tsx"], images: { unoptimized: true } } : {}),
  cacheComponents: !demo,
  partialPrefetching: !demo,
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
