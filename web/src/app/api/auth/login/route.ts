import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { ensureUserBootstrap } from "@/server/ensureUserBootstrap";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
  clearSessionCookieOptions,
  createSessionToken,
  sessionCookieOptions,
} from "@/server/session";

export const runtime = "nodejs";

const BodySchema = z.object({
  username: z.string().min(1).max(32),
});

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ ok: false, error: "DISABLED" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const username = parsed.data.username.trim();
  if (!username) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  try {
    const user = await prisma.user.upsert({
      where: { username },
      create: { username },
      update: {},
    });

    await ensureUserBootstrap(user.id);

    const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username } });
    res.cookies.set(SESSION_COOKIE_NAME, createSessionToken(user.id), sessionCookieOptions(SESSION_MAX_AGE_SEC));
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
