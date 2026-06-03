import { prisma } from "@/server/db";
import { getSessionUserId } from "@/server/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = getSessionUserId(req);
  if (!userId) return Response.json({ ok: true, user: null });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return Response.json({ ok: true, user: null });

  return Response.json({
    ok: true,
    user: { id: user.id, username: user.username, usernameChosen: user.usernameChosen ?? true },
  });
}

