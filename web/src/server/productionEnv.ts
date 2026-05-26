import { readEnv } from "@/server/envUtil";

/** prod 부팅 시 필수 env·위험 설정을 로그로 경고한다. */
export function validateProductionEnv() {
  if (process.env.NODE_ENV !== "production") return;

  const warnings: string[] = [];
  if (!readEnv("SESSION_SECRET")) warnings.push("SESSION_SECRET 필수");
  if (!readEnv("ADMIN_TOKEN")) warnings.push("ADMIN_TOKEN 필수");
  if (!readEnv("DATABASE_URL")) warnings.push("DATABASE_URL 필수");
  if (!readEnv("GOOGLE_CLIENT_ID") || !readEnv("GOOGLE_CLIENT_SECRET")) {
    warnings.push("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 권장");
  }
  if (process.env.MERXATUS_ALLOW_DEV_TOOLS === "1") {
    warnings.push("MERXATUS_ALLOW_DEV_TOOLS=1 은 prod에서 사용 금지");
  }
  const session = readEnv("SESSION_SECRET");
  const admin = readEnv("ADMIN_TOKEN");
  if (session && admin && session === admin) {
    warnings.push("SESSION_SECRET 과 ADMIN_TOKEN 은 서로 달라야 합니다");
  }
  if (warnings.length > 0) {
    console.error("[productionEnv] 배포 전 확인:", warnings.join(" · "));
  }
}
