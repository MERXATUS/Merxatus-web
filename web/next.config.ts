import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Turbopack 번들에 Prisma를 넣지 않아 delegate(chatMessage.create 등) 누락 방지 */
  serverExternalPackages: ["@prisma/client", "prisma"],
  /** dev는 NEXT_DISABLE_TURBOPACK=1, production build는 `next build --webpack` */
  webpack(config, { dev }) {
    if (dev) {
      const prev = config.watchOptions?.ignored;
      const base = Array.isArray(prev) ? prev : prev ? [prev] : [];
      const ignored = [
        ...base.filter(
          (p): p is string | RegExp =>
            (typeof p === "string" && p.length > 0) || p instanceof RegExp,
        ),
        "**/.cursor/**",
        "**/agent-transcripts/**",
        "../.cursor/**",
        "**/.git/**",
        "**/prisma/migrations/**",
        "**/data/**",
        "**/node_modules/.prisma/**",
      ];
      config.watchOptions = {
        ...config.watchOptions,
        ignored,
        /** Windows에서 연속 저장·감시 이벤트를 묶어 Compiling 스톰 완화 */
        aggregateTimeout: 800,
      };
    }
    return config;
  },
};

export default nextConfig;
