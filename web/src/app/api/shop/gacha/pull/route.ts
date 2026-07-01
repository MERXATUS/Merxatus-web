import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { pullGachaShop } from "@/server/gachaShop";
import { tryTutorialGachaPull } from "@/server/tutorialProgress";
import { getGachaPool } from "@/shared/gachaShop";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  poolId: z.string().min(1),
  count: z.union([z.literal(1), z.literal(10)]).default(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json ?? {});
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const pool = getGachaPool(parsed.data.poolId);
  if (!pool) return Response.json({ ok: false, error: "UNKNOWN_POOL" }, { status: 400 });

  const count = parsed.data.count;
  if (count === 10 && pool.multiCount !== 10) {
    return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const result = await pullGachaShop({
      userId: auth.userId,
      poolId: pool.id,
      count,
    });
    const tutorial = await tryTutorialGachaPull(prisma, auth.userId);
    return Response.json({ ...result, tutorialAdvanced: tutorial.advanced });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
