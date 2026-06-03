import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { normalizeUsernameInput, validateUsername } from "@/shared/usernameRules";

export const runtime = "nodejs";

const BodySchema = z.object({
  username: z.string().min(1).max(64),
});

export async function POST(req: Request) {
  const auth = requireUserId(req);
  if (!auth.ok) return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const checked = validateUsername(parsed.data.username);
  if (!checked.ok) return Response.json({ ok: false, error: checked.code }, { status: 400 });

  const username = normalizeUsernameInput(checked.username);

  const current = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, username: true },
  });
  if (!current) return Response.json({ ok: false, error: "USER_NOT_FOUND" }, { status: 404 });
  if (current.username === username) {
    return Response.json({ ok: false, error: "SAME_USERNAME" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: auth.userId },
      data: { username, usernameChosen: true },
      select: { id: true, username: true },
    });
    return Response.json({ ok: true, user: updated });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ ok: false, error: "USERNAME_TAKEN" }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
