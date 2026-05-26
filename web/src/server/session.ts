import crypto from "node:crypto";
import { getSessionSecret } from "@/server/secrets";

export const SESSION_COOKIE_NAME = "sid";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

const COOKIE_NAME = SESSION_COOKIE_NAME;

/** Vercel(HTTPS)에서 세션 쿠키가 안 붙는 경우 방지 */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}

export function clearSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  };
}

function base64urlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64urlDecode(s: string) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/") + pad;
  return Buffer.from(b64, "base64");
}

type SessionPayload = {
  v: 1;
  userId: string;
  iat: number;
};

function sign(input: string) {
  return base64urlEncode(crypto.createHmac("sha256", getSessionSecret()).update(input).digest());
}

export function createSessionToken(userId: string) {
  const payload: SessionPayload = { v: 1, userId, iat: Date.now() };
  const json = JSON.stringify(payload);
  const body = base64urlEncode(Buffer.from(json, "utf8"));
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function createSessionCookie(userId: string) {
  const value = createSessionToken(userId);
  const opts = sessionCookieOptions(SESSION_MAX_AGE_SEC);
  return `${COOKIE_NAME}=${value}; Path=${opts.path}; HttpOnly; SameSite=Lax; Max-Age=${opts.maxAge}${opts.secure ? "; Secure" : ""}`;
}

export function clearSessionCookie() {
  const opts = clearSessionCookieOptions();
  return `${COOKIE_NAME}=; Path=${opts.path}; HttpOnly; SameSite=Lax; Max-Age=0${opts.secure ? "; Secure" : ""}`;
}

export function getSessionUserId(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!m) return null;
  const raw = m[1] ?? "";
  const [body, sig] = raw.split(".", 2);
  if (!body || !sig) return null;
  const expected = sign(body);
  try {
    // timingSafeEqual requires equal lengths
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const json = base64urlDecode(body).toString("utf8");
    const payload = JSON.parse(json) as SessionPayload;
    if (payload?.v !== 1) return null;
    if (typeof payload.userId !== "string" || payload.userId.length < 1) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

