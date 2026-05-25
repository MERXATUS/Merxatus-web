"use client";

import { SessionProvider } from "@/app/_components/SessionProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
