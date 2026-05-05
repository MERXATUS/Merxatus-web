import { z } from "zod";
import { prisma } from "@/server/db";
import { GAME_RULES } from "@/server/gameRules";
import { requireUserId } from "@/server/auth";
import { ensureMinionEntitiesForUser } from "@/server/ensureMinionEntitiesForUser";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

function nextPrice(owned: number) {
  const price = GAME_RULES.minions.basePrice * Math.pow(GAME_RULES.minions.growth, owned);
  return Math.ceil(price);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
  const userId = auth.userId;
  await ensureMinionEntitiesForUser(userId);
  const [inv, agg] = await Promise.all([
    prisma.minionInventory.findUnique({ where: { userId } }),
    prisma.workshopInstance.aggregate({
      where: { userId },
      _sum: { minionCount: true },
    }),
  ]);

  const owned = inv?.owned ?? 1;
  const assigned = agg._sum.minionCount ?? 0;
  const free = Math.max(0, owned - assigned);

  return Response.json({
    ok: true,
    owned,
    assigned,
    free,
    nextPrice: nextPrice(owned),
  });
}

