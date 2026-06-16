import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { getSessionSecret } from "@/server/secrets";
import { readEnv } from "@/server/envUtil";
import { ensureUserBootstrap } from "@/server/ensureUserBootstrap";
import { checkNewSignupAllowed } from "@/server/signupPolicy";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const OAUTH_STATE_COOKIE = "oauth_state";
export const OAUTH_REDIRECT_COOKIE = "oauth_redirect";
const STATE_MAX_AGE_SEC = 600;

function normalizeRedirectUri(uri: string) {
  const trimmed = uri.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export type GoogleAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getGoogleAuthConfig(req: Request): GoogleAuthConfig | null {
  const clientId = readEnv("GOOGLE_CLIENT_ID");
  const clientSecret = readEnv("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  const origin = new URL(req.url).origin;
  const envRedirect = readEnv("GOOGLE_REDIRECT_URI");
  let redirectUri = `${origin}/api/auth/google/callback`;
  if (envRedirect) {
    try {
      if (new URL(envRedirect).origin === origin) {
        redirectUri = envRedirect;
      }
    } catch {
      /* 현재 접속 origin 사용 */
    }
  }
  redirectUri = normalizeRedirectUri(redirectUri);

  return { clientId, clientSecret, redirectUri };
}

export function readOAuthRedirectCookie(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${OAUTH_REDIRECT_COOKIE}=([^;]+)`));
  if (!m?.[1]) return null;
  try {
    return normalizeRedirectUri(decodeURIComponent(m[1]));
  } catch {
    return normalizeRedirectUri(m[1]);
  }
}

/** 로그인 시작 시 쓴 redirect_uri를 콜백·토큰 교환에 그대로 사용 */
export function resolveOAuthRedirectUri(req: Request, config: GoogleAuthConfig) {
  return readOAuthRedirectCookie(req) || config.redirectUri;
}

function getStateSecret() {
  return getSessionSecret();
}

function signState(payload: string) {
  return crypto.createHmac("sha256", getStateSecret()).update(payload).digest("hex");
}

export function createOAuthStateValue() {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${nonce}.${Date.now()}`;
  return `${payload}.${signState(payload)}`;
}

export function verifyOAuthStateValue(state: string | null): boolean {
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, ts, sig] = parts;
  const payload = `${nonce}.${ts}`;
  const expected = signState(payload);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    if (!crypto.timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > STATE_MAX_AGE_SEC * 1000) return false;
  return true;
}

export function createOAuthStateCookie(state: string) {
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${STATE_MAX_AGE_SEC}`;
}

export function clearOAuthStateCookie() {
  return `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readOAuthStateCookie(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${OAUTH_STATE_COOKIE}=([^;]+)`));
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function buildGoogleAuthUrl(config: GoogleAuthConfig, state: string) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function exchangeGoogleCode(config: GoogleAuthConfig, code: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const json = (await res.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!res.ok || !json.access_token) {
    const err = json.error || "unknown";
    const msg = json.error_description || `HTTP_${res.status}`;
    throw new Error(
      `GOOGLE_TOKEN_FAILED|${err}|${encodeURIComponent(msg)}|${encodeURIComponent(config.redirectUri)}`,
    );
  }
  return json.access_token;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as GoogleUserInfo;
  if (!res.ok || !json.sub) {
    throw new Error("GOOGLE_USERINFO_FAILED");
  }
  return json;
}

function sanitizeUsernameBase(raw: string) {
  const trimmed = raw.trim().replace(/\s+/g, "_");
  const cleaned = trimmed.replace(/[^\w\u3131-\u318E\uAC00-\uD7A3.-]/g, "");
  return (cleaned || "player").slice(0, 24);
}

async function allocateUsername(base: string) {
  let candidate = base.slice(0, 32);
  for (let i = 0; i < 24; i++) {
    const taken = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!taken) return candidate;
    const suffix = i === 0 ? "" : `_${i}`;
    candidate = `${base.slice(0, Math.max(1, 32 - suffix.length))}${suffix}`;
  }
  return `player_${crypto.randomBytes(3).toString("hex")}`;
}

export async function findOrCreateGoogleUser(info: GoogleUserInfo) {
  const googleId = info.sub!;
  const email = info.email?.trim() || null;

  const byGoogle = await prisma.user.findUnique({ where: { googleId } });
  if (byGoogle) return byGoogle;

  if (email) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      return prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId, email: byEmail.email ?? email },
      });
    }
  }

  const signup = checkNewSignupAllowed(email);
  if (!signup.ok) {
    throw new Error(signup.error);
  }

  const username = await allocateUsername(
    sanitizeUsernameBase(info.name || email?.split("@")[0] || "player"),
  );

  const user = await prisma.user.create({
    data: {
      username,
      usernameChosen: false,
      googleId,
      email,
    },
  });

  await ensureUserBootstrap(user.id);
  return user;
}

export { OAUTH_STATE_COOKIE };
