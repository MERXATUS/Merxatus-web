import { readEnv } from "@/server/envUtil";

/** 비어 있으면 누구나 가입 가능. 쉼표 구분 이메일이 있으면 신규 가입만 제한한다. */
function parseSignupAllowlist(): Set<string> | null {
  const raw = readEnv("MERXATUS_SIGNUP_ALLOWLIST");
  if (!raw) return null;
  const emails = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) return null;
  return new Set(emails);
}

export type SignupCheckResult =
  | { ok: true }
  | { ok: false; error: "SIGNUP_CLOSED" | "SIGNUP_NOT_ALLOWED" };

/** 신규 Google 가입 전에 호출. 기존 유저 로그인에는 쓰지 않는다. */
export function checkNewSignupAllowed(email: string | null | undefined): SignupCheckResult {
  const allowlist = parseSignupAllowlist();
  if (!allowlist) return { ok: true };

  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized) return { ok: false, error: "SIGNUP_NOT_ALLOWED" };
  if (!allowlist.has(normalized)) return { ok: false, error: "SIGNUP_NOT_ALLOWED" };
  return { ok: true };
}

export function isSignupOpenToPublic() {
  return parseSignupAllowlist() === null;
}
