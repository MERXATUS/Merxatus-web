import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { GAME_RULES } from "@/server/gameRules";
import { countDungeonMinions, dungeonMinionWhere } from "@/server/minionCapacity";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";
import { loadDungeons } from "@/server/dungeonData";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
    const userId = auth.userId;

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [
      userAccount,
      wallet,
      invAgg,
      weaponCount,
      listingCount,
      todayTxs,
      dungeonMinions,
      activeRun,
      dungeonCount,
    ] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
      prisma.wallet.findUnique({ where: { userId } }),
      prisma.inventoryStack.aggregate({
        where: { userId, quantity: { gt: 0 } },
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      prisma.weaponInstance.count({ where: { userId } }),
      prisma.listing.count({ where: { sellerId: userId, status: "ACTIVE" } }),
      prisma.transaction.findMany({
        where: {
          createdAt: { gte: dayStart },
          OR: [{ buyerId: userId }, { sellerId: userId }],
        },
        select: { buyerId: true, sellerId: true, grossGold: true, netGold: true },
        take: 200,
      }),
      prisma.minion.findMany({
        where: dungeonMinionWhere(userId),
        select: { level: true },
        orderBy: [{ level: "desc" }],
        take: 1,
      }),
      prisma.dungeonRun.findFirst({
        where: { userId, status: "RUNNING" },
        orderBy: { startedAt: "desc" },
        select: { dungeonId: true },
      }),
      countDungeonMinions(prisma, userId),
    ]);

    let todayNetGold = 0;
    for (const t of todayTxs) {
      if (t.sellerId === userId) todayNetGold += t.netGold;
      else if (t.buyerId === userId) todayNetGold -= t.grossGold;
    }

    let dungeonName: string | null = null;
    if (activeRun) {
      const { dungeons } = await loadDungeons();
      dungeonName = dungeons.find((d) => d.id === activeRun.dungeonId)?.name ?? activeRun.dungeonId;
    }

    return Response.json({
      ok: true,
      username: userAccount?.username ?? null,
      wallet: {
        goldAvailable: wallet?.goldAvailable ?? 0,
        goldLocked: wallet?.goldLocked ?? 0,
      },
      market: {
        activeListingCount: listingCount,
        maxActiveListings: GAME_RULES.market.maxActiveListingsPerUser,
      },
      todayNetGold,
      inventory: {
        kindCount: invAgg._count._all,
        totalQty: invAgg._sum.quantity ?? 0,
        weaponCount,
      },
      mercenaries: {
        count: dungeonCount,
        maxCount: GAME_RULES.minion.maxDungeonOwned,
        topLevel: dungeonMinions[0]?.level ?? null,
      },
      dungeon: {
        active: !!activeRun,
        name: dungeonName,
      },
    });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : "UNKNOWN";
    console.error("[me/summary]", e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
