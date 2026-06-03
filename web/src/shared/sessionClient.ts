import { formatPanelError } from "@/shared/formatPanelError";

export const SESSION_CHANGED_EVENT = "auth_session_changed";

export type SessionUser = { id: string; username: string; usernameChosen?: boolean };

export type AuthMeResponse = { ok: true; user: SessionUser | null };

export function notifySessionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: "include", ...init });
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

export async function apiPostJson<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throwApiError(json, res.status);
  return json;
}

export async function fetchSessionUser(): Promise<SessionUser | null> {
  const r = await apiGetJson<AuthMeResponse>("/api/auth/me");
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
