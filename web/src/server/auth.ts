import { getSessionUserId } from "@/server/session";

/**
 * 세션 쿠키(sid)가 있으면 항상 그 사용자로 인증한다.
 * 세션이 없을 때만 body/query의 fallbackUserId(개발·레거시)를 사용한다.
 */
export function requireUserId(req: Request, fallbackUserId?: string | null) {
  const sessionUserId = getSessionUserId(req);
  if (sessionUserId) {
    return { ok: true as const, userId: sessionUserId };
  }
  const userId = fallbackUserId ?? null;
  if (!userId) return { ok: false as const, error: "UNAUTHORIZED" as const };
  return { ok: true as const, userId };
}

