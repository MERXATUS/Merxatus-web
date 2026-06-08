import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";

export const runtime = "nodejs";

const BodySchema = z.object({
  minionId: z.string().min(1).nullable(),
});

export async function POST(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const { minionId } = parsed.data;
    if (minionId) {
      const owned = await prisma.minion.findFirst({
        where: { id: minionId, userId: auth.userId },
        select: { id: true },
      });
      if (!owned) return Response.json({ ok: false, error: "MINION_NOT_FOUND" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: auth.userId },
      data: { representativeMinionId: minionId },
    });

    return Response.json({ ok: true as const, representativeMinionId: minionId });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : "UNKNOWN";
    console.error("[minions/representative]", e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
