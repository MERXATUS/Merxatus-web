import { NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  createOAuthStateValue,
  getGoogleAuthConfig,
  OAUTH_REDIRECT_COOKIE,
  OAUTH_STATE_COOKIE,
} from "@/server/googleAuth";
import { sessionCookieOptions } from "@/server/session";

export const runtime = "nodejs";

const STATE_MAX_AGE_SEC = 600;

export async function GET(req: Request) {
  const config = getGoogleAuthConfig(req);
  if (!config) {
    return NextResponse.redirect(new URL("/?auth_error=google_not_configured", req.url));
  }

  const state = createOAuthStateValue();
  const url = buildGoogleAuthUrl(config, state);

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_STATE_COOKIE, state, sessionCookieOptions(STATE_MAX_AGE_SEC));
  res.cookies.set(OAUTH_REDIRECT_COOKIE, config.redirectUri, sessionCookieOptions(STATE_MAX_AGE_SEC));
  return res;
}
