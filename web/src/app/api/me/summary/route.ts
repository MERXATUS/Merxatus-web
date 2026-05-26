import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { getUserSpecialistRow } from "@/server/userSpecialistDb";
import { processWorkshopNamesForProfession, type SpecialistProfessionSlug } from "@/shared/specialistProfession";
import { GAME_RULES } from "@/server/gameRules";
import { countDungeonMinions, countGatherMinions, gatherMinionWhere, dungeonMinionWhere } from "@/server/minionCapacity";
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

    const userLite = await getUserSpecialistRow(prisma, userId);
    const prof = userLite?.specialistProfession ?? null;
    const specialistWorkshopNames = prof
      ? [...processWorkshopNamesForProfession(prof as SpecialistProfessionSlug)]
      : [];

    const [
      userAccount,
      wallet,
      invAgg,
      weaponCount,
      listingCount,
      todayTxs,
      gatherWorkshopCount,
      specialistWorkshopCount,
      gatherAssigned,
      dungeonMinions,
      activeRun,
      gatherCount,
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
      prisma.workshopInstance.count({
        where: { userId, workshopType: { kind: "GATHER" } },
      }),
      specialistWorkshopNames.length
        ? prisma.workshopInstance.count({
            where: {
              userId,
              workshopType: { kind: "PROCESS", name: { in: specialistWorkshopNames } },
            },
          })
        : Promise.resolve(0),
      prisma.workshopAssignment.count({
        where: { workshop: { userId }, minion: gatherMinionWhere(userId) },
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
      countGatherMinions(prisma, userId),
      countDungeonMinions(prisma, userId),
    ]);

    let todayNetGold = 0;
    for (const t of todayTxs) {
      if (t.sellerId === userId) todayNetGold += t.netGold;
      else if (t.buyerId === userId) todayNetGold -= t.grossGold;
    }

    let crafting: { recipeName: string; remainingMs: number } | null = null;
    if (specialistWorkshopNames.length > 0) {
      const craftingWs = await prisma.workshopInstance.findFirst({
        where: {
          userId,
          processCraftRecipeId: { not: null },
          processCraftEndsAt: { not: null },
          workshopType: { kind: "PROCESS", name: { in: specialistWorkshopNames } },
        },
        select: { processCraftRecipeId: true, processCraftEndsAt: true },
        orderBy: { processCraftEndsAt: "asc" },
      });
      if (craftingWs?.processCraftRecipeId && craftingWs.processCraftEndsAt) {
        const recipe = await prisma.recipe.findUnique({
          where: { id: craftingWs.processCraftRecipeId },
          select: { name: true },
        });
        crafting = {
          recipeName: recipe?.name ?? "제작 중",
          remainingMs: Math.max(0, craftingWs.processCraftEndsAt.getTime() - Date.now()),
        };
      }
    }

    let dungeonName: string | null = null;
    if (activeRun) {
      const { dungeons } = await loadDungeons();
      dungeonName = dungeons.find((d) => d.id === activeRun.dungeonId)?.name ?? activeRun.dungeonId;
    }

    return Response.json({
      ok: true,
      username: userAccount?.username ?? null,
      specialistProfession: prof,
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
      gather: {
        workshopCount: gatherWorkshopCount,
        minionsPlaced: gatherAssigned,
        minionOwned: gatherCount,
        maxMinions: GAME_RULES.minion.maxGatherOwned,
      },
      specialist: {
        workshopCount: specialistWorkshopCount,
        crafting,
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
