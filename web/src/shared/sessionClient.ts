import { API_CACHE_TTL, invalidateApiCache, withApiCache, withApiCacheSwr } from "@/shared/apiCache";
import { invalidateCombatRosterCache } from "@/shared/combatRosterClient";
import { formatPanelError } from "@/shared/formatPanelError";

export const SESSION_CHANGED_EVENT = "auth_session_changed";

export type SessionUser = { id: string; username: string; usernameChosen?: boolean };

export type AuthMeResponse = { ok: true; user: SessionUser | null };

export function notifySessionChanged() {
  invalidateApiCache();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

const DEFAULT_FETCH_TIMEOUT_MS = 25_000;

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeoutMs =
    typeof window === "undefined" || (typeof init?.signal === "object" && init.signal != null)
      ? null
      : DEFAULT_FETCH_TIMEOUT_MS;
  if (!timeoutMs) {
    return fetch(input, { credentials: "include", ...init });
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      credentials: "include",
      ...init,
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("REQUEST_TIMEOUT");
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}

function throwApiError(json: unknown, status: number): never {
  const base = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
  const err = new Error(formatPanelError({ ...base, status }));
  Object.assign(err, base);
  (err as { status?: number }).status = status;
  throw err;
}

export async function apiGetJson<T>(url: string): Promise<T> {
  const res = await apiFetch(url, { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throwApiError(json, res.status);
  return json;
}

export async function apiGetJsonCached<T>(
  url: string,
  opts?: { ttlMs?: number; force?: boolean },
): Promise<T> {
  return withApiCache(url, () => apiGetJson<T>(url), opts);
}

export async function apiGetJsonCachedSwr<T>(
  url: string,
  opts?: { ttlMs?: number; force?: boolean; onRevalidate?: (data: T) => void },
): Promise<T> {
  return withApiCacheSwr(url, () => apiGetJson<T>(url), opts);
}

export async function apiPostJson<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throwApiError(json, res.status);
  invalidateApiCache("/api/me");
  if (url.includes("/dungeons/")) {
    invalidateApiCache("/api/dungeons");
    invalidateApiCache("/api/me/summary");
  } else if (url.includes("/raids/")) {
    invalidateApiCache("/api/raids");
  } else if (url.includes("/tower/")) {
    invalidateApiCache("/api/tower");
  } else if (url.includes("/minions/")) {
    invalidateApiCache("/api/minions");
    invalidateApiCache("/api/me");
    invalidateCombatRosterCache();
  } else if (url.includes("/inventory/") || url.includes("/codex/")) {
    invalidateApiCache("/api/inventory");
    invalidateApiCache("/api/codex");
    invalidateApiCache("/api/me");
  } else if (url.includes("/trade/")) {
    invalidateApiCache("/api/trade");
  } else if (url.includes("/market/")) {
    invalidateApiCache("/api/me");
  }
  return json;
}

export async function fetchSessionUser(opts?: { force?: boolean }): Promise<SessionUser | null> {
  const r = await apiGetJsonCached<AuthMeResponse>("/api/auth/me", {
    ttlMs: API_CACHE_TTL.auth,
    force: opts?.force,
  });
  return r.user ?? null;
}

export function isUnauthorizedError(e: unknown): boolean {
  if (e == null) return false;
  if (typeof e === "string") return e === "UNAUTHORIZED";
  if (typeof e === "object") {
    const o = e as { error?: string; status?: number };
    return o.error === "UNAUTHORIZED" || o.status === 401;
  }
  return false;
}
