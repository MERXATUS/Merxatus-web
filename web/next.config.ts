import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Turbopack 번들에 Prisma를 넣지 않아 delegate(chatMessage.create 등) 누락 방지 */
  serverExternalPackages: ["@prisma/client", "prisma"],
  /** dev는 NEXT_DISABLE_TURBOPACK=1, production build는 `next build --webpack` */
  webpack(config, { dev }) {
    if (dev) {
      const prev = config.watchOptions?.ignored;
      const ignored = [
        ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
        "**/.cursor/**",
        "**/agent-transcripts/**",
        "../.cursor/**",
      ];
      config.watchOptions = { ...config.watchOptions, ignored };
    }
    return config;
  },
};

export default nextConfig;
