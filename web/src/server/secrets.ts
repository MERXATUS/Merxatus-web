import { readEnv } from "@/server/envUtil";

/** 세션·OAuth state·recruit pick token 서명용 — prod에서는 SESSION_SECRET 필수 */
export function getSessionSecret(): string {
  const session = readEnv("SESSION_SECRET");
  if (session) return session;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET_NOT_SET");
  }
  const admin = readEnv("ADMIN_TOKEN");
  if (admin) {
    console.warn("[secrets] SESSION_SECRET 미설정 — 개발 환경에서 ADMIN_TOKEN을 폴백으로 사용합니다.");
    return admin;
  }
  throw new Error("SESSION_SECRET_NOT_SET");
}
