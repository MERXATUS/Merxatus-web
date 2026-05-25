import { z } from "zod";
import { prisma } from "@/server/db";
import { GAME_RULES } from "@/server/gameRules";
import { requireUserId } from "@/server/auth";
import { ensureMinionEntitiesForUser } from "@/server/ensureMinionEntitiesForUser";
import {
  countDungeonMinions,
  countGatherMinions,
  countGatherWorkshopAssignments,
  MAX_DUNGEON_MINIONS,
  MAX_GATHER_MINIONS,
} from "@/server/minionCapacity";
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

    const [inv, gatherCount, dungeonCount, gatherAssigned] = await Promise.all([
      prisma.minionInventory.findUnique({ where: { userId } }),
      countGatherMinions(prisma, userId),
      countDungeonMinions(prisma, userId),
      countGatherWorkshopAssignments(prisma, userId),
    ]);

    const gatherOwned = inv?.gatherOwned ?? gatherCount;
    const dungeonOwned = inv?.dungeonOwned ?? dungeonCount;
    const gatherFree = Math.max(0, gatherCount - gatherAssigned);
    const owned = gatherCount;
    const assigned = gatherAssigned;
    const free = gatherFree;

    return Response.json({
      ok: true,
      owned,
      assigned,
      free,
      nextPrice: nextPrice(gatherOwned),
      gatherCount,
      gatherOwned,
      gatherAssigned,
      gatherFree,
      maxGatherOwned: MAX_GATHER_MINIONS,
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
