import { getSessionUserId } from "@/server/session";

/**
 * 세션 쿠키(sid)로만 인증한다.
 * 개발 환경에서만 body/query userId 폴백을 허용한다 (로컬 curl·레거시 스크립트용).
 */
export function requireUserId(req: Request, fallbackUserId?: string | null) {
  const sessionUserId = getSessionUserId(req);
  if (sessionUserId) {
    return { ok: true as const, userId: sessionUserId };
  }
  if (process.env.NODE_ENV !== "production") {
    const userId = fallbackUserId ?? null;
    if (userId) return { ok: true as const, userId };
  }
  return { ok: false as const, error: "UNAUTHORIZED" as const };
}
