import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Turbopack 번들에 Prisma를 넣지 않아 delegate(chatMessage.create 등) 누락 방지 */
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
