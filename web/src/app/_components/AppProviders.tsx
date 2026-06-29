"use client";

import { SessionProvider } from "@/app/_components/SessionProvider";
import { ServiceWorkerRegister } from "@/app/_components/ServiceWorkerRegister";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ServiceWorkerRegister />
      {children}
    </SessionProvider>
  );
}
