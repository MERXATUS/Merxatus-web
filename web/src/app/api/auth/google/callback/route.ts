import { NextResponse } from "next/server";
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  findOrCreateGoogleUser,
  getGoogleAuthConfig,
  OAUTH_REDIRECT_COOKIE,
  OAUTH_STATE_COOKIE,
  readOAuthStateCookie,
  resolveOAuthRedirectUri,
  verifyOAuthStateValue,
} from "@/server/googleAuth";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
  clearSessionCookieOptions,
  createSessionToken,
  sessionCookieOptions,
} from "@/server/session";

export const runtime = "nodejs";

function redirectHome(req: Request, authError?: string) {
  const home = new URL("/", req.url);
  if (authError) home.searchParams.set("auth_error", authError);
  const res = NextResponse.redirect(home);
  res.cookies.set(OAUTH_STATE_COOKIE, "", clearOAuthCookieOptions());
  res.cookies.set(OAUTH_REDIRECT_COOKIE, "", clearOAuthCookieOptions());
  return res;
}

function clearOAuthCookieOptions() {
  return { ...clearSessionCookieOptions(), maxAge: 0 };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  if (err) {
    return redirectHome(req, err);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = readOAuthStateCookie(req);

  if (!code || !state || !verifyOAuthStateValue(state)) {
    return redirectHome(req, "invalid_state");
  }
  if (cookieState && cookieState !== state) {
    return redirectHome(req, "invalid_state");
  }

  const config = getGoogleAuthConfig(req);
  if (!config) {
    return redirectHome(req, "google_not_configured");
  }

  try {
    const redirectUri = resolveOAuthRedirectUri(req, config);
    const accessToken = await exchangeGoogleCode({ ...config, redirectUri }, code);
    const profile = await fetchGoogleUserInfo(accessToken);
    const user = await findOrCreateGoogleUser(profile);

    const res = NextResponse.redirect(new URL("/?auth_refresh=1", req.url));
    res.cookies.set(SESSION_COOKIE_NAME, createSessionToken(user.id), sessionCookieOptions(SESSION_MAX_AGE_SEC));
    res.cookies.set(OAUTH_STATE_COOKIE, "", clearOAuthCookieOptions());
    res.cookies.set(OAUTH_REDIRECT_COOKIE, "", clearOAuthCookieOptions());
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("[auth/google/callback]", e);
    return redirectHome(req, message);
  }
}
