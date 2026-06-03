import { z } from "zod";
import { prisma } from "@/server/db";
import { GAME_RULES } from "@/server/gameRules";
import { requireUserId } from "@/server/auth";
import { ensureMinionEntitiesForUser } from "@/server/ensureMinionEntitiesForUser";
import { countDungeonMinions, MAX_DUNGEON_MINIONS } from "@/server/minionCapacity";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

function nextPrice(owned: number) {
  const price = GAME_RULES.minions.basePrice * Math.pow(GAME_RULES.minions.growth, owned);
  return Math.ceil(price);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
    const userId = auth.userId;

    await ensureMinionEntitiesForUser(userId);

    const [inv, dungeonCount] = await Promise.all([
      prisma.minionInventory.findUnique({ where: { userId } }),
      countDungeonMinions(prisma, userId),
    ]);

    const dungeonOwned = inv?.dungeonOwned ?? dungeonCount;
    const owned = dungeonCount;
    const free = dungeonCount;

    return Response.json({
      ok: true,
      owned,
      assigned: 0,
      free,
      nextPrice: nextPrice(dungeonOwned),
      dungeonCount,
      dungeonOwned,
      maxDungeonOwned: MAX_DUNGEON_MINIONS,
    });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { ok: false, error: "INTERNAL_SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
