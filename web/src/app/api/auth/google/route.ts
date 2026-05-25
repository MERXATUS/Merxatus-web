import { NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  createOAuthStateValue,
  getGoogleAuthConfig,
  OAUTH_REDIRECT_COOKIE,
  OAUTH_STATE_COOKIE,
} from "@/server/googleAuth";

export const runtime = "nodejs";

const STATE_MAX_AGE_SEC = 600;

export async function GET(req: Request) {
  const config = getGoogleAuthConfig(req);
  if (!config) {
    return NextResponse.redirect(new URL("/?auth_error=google_not_configured", req.url));
  }

  const requestOrigin = new URL(req.url).origin;
  const redirectOrigin = new URL(config.redirectUri).origin;
  if (requestOrigin !== redirectOrigin) {
    const hint = encodeURIComponent(
      `wrong_origin:게임 접속 주소는 ${redirectOrigin} 이어야 합니다. (현재 ${requestOrigin})`,
    );
    return NextResponse.redirect(new URL(`/?auth_error=${hint}`, req.url));
  }

  const state = createOAuthStateValue();
  const url = buildGoogleAuthUrl(config, state);

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: STATE_MAX_AGE_SEC,
  });
  res.cookies.set(OAUTH_REDIRECT_COOKIE, config.redirectUri, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: STATE_MAX_AGE_SEC,
  });
  return res;
}
