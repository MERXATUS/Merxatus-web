"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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

const FOCUS_REFRESH_DEBOUNCE_MS = 8_000;
const SESSION_FETCH_TIMEOUT_MS = 20_000;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const lastFocusRefreshRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const next = await Promise.race([
        fetchSessionUser(),
        new Promise<null>((_, reject) => {
          window.setTimeout(() => reject(new Error("SESSION_TIMEOUT")), SESSION_FETCH_TIMEOUT_MS);
        }),
      ]);
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
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth_refresh") === "1") {
      params.delete("auth_refresh");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
    }
    void refresh();
    const onSessionChanged = () => void refresh();
    const onFocusOrShow = () => {
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < FOCUS_REFRESH_DEBOUNCE_MS) return;
      lastFocusRefreshRef.current = now;
      void refresh();
    };
    window.addEventListener(SESSION_CHANGED_EVENT, onSessionChanged);
    window.addEventListener("focus", onFocusOrShow);
    window.addEventListener("pageshow", onFocusOrShow);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, onSessionChanged);
      window.removeEventListener("focus", onFocusOrShow);
      window.removeEventListener("pageshow", onFocusOrShow);
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
