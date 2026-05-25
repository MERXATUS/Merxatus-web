"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  SESSION_CHANGED_EVENT,
  fetchSessionUser,
  type SessionUser,
} from "@/shared/sessionClient";

type SessionContextValue = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<SessionUser | null>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchSessionUser();
      setUser(next);
      return next;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChanged = () => void refresh();
    window.addEventListener(SESSION_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onChanged);
    window.addEventListener("pageshow", onChanged);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onChanged);
      window.removeEventListener("pageshow", onChanged);
    };
  }, [refresh]);

  const value = useMemo(() => ({ user, loading, refresh }), [user, loading, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionUser() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessionUser must be used within SessionProvider");
  return ctx;
}
