import { NextResponse } from "next/server";
import { createGuestUser } from "@/server/guestAuth";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
  createSessionToken,
  sessionCookieOptions,
} from "@/server/session";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await createGuestUser();

    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, username: user.username, usernameChosen: user.usernameChosen },
    });
    res.cookies.set(SESSION_COOKIE_NAME, createSessionToken(user.id), sessionCookieOptions(SESSION_MAX_AGE_SEC));
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    console.error("[auth/guest]", e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
