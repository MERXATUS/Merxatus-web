import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { getUserSpecialistRow } from "@/server/userSpecialistDb";
import { playerMatchesProcessWorkshop } from "@/shared/specialistProfession";
import { GAME_RULES } from "@/server/gameRules";
import { countDungeonMinions, countGatherMinions, gatherMinionWhere, dungeonMinionWhere } from "@/server/minionCapacity";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";
import { loadDungeons } from "@/server/dungeonData";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

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
      userLite,
      userAccount,
      wallet,
      invAgg,
      weaponCount,
      listingCount,
      todayTxs,
      workshops,
      gatherAssigned,
      dungeonMinions,
      activeRun,
    ] = await Promise.all([
      getUserSpecialistRow(prisma, userId),
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
      }),
      prisma.workshopInstance.findMany({
        where: { userId },
        include: { workshopType: true },
        orderBy: [{ plotSlot: "asc" }, { createdAt: "asc" }],
      }),
      prisma.workshopAssignment.count({
        where: { workshop: { userId }, minion: gatherMinionWhere(userId) },
      }),
      prisma.minion.findMany({
        where: dungeonMinionWhere(userId),
        select: { level: true },
        orderBy: [{ level: "desc" }],
        take: 20,
      }),
      prisma.dungeonRun.findFirst({
        where: { userId, status: "RUNNING" },
        orderBy: { startedAt: "desc" },
      }),
    ]);

    let todayNetGold = 0;
    for (const t of todayTxs) {
      if (t.sellerId === userId) todayNetGold += t.netGold;
      else if (t.buyerId === userId) todayNetGold -= t.grossGold;
    }

    const prof = userLite?.specialistProfession ?? null;
    const gatherRows = workshops.filter((w) => w.workshopType.kind === "GATHER");
    const specialistRows = prof
      ? workshops.filter(
          (w) => w.workshopType.kind === "PROCESS" && playerMatchesProcessWorkshop(w.workshopType.name, prof),
        )
      : [];

    let crafting: { recipeName: string; remainingMs: number } | null = null;
    for (const w of specialistRows) {
      if (!w.processCraftRecipeId || !w.processCraftEndsAt) continue;
      const recipe = await prisma.recipe.findUnique({
        where: { id: w.processCraftRecipeId },
        select: { name: true },
      });
      const remainingMs = Math.max(0, w.processCraftEndsAt.getTime() - Date.now());
      crafting = {
        recipeName: recipe?.name ?? "제작 중",
        remainingMs,
      };
      break;
    }

    const gatherCount = await countGatherMinions(prisma, userId);
    const dungeonCount = await countDungeonMinions(prisma, userId);

    const { dungeons } = await loadDungeons();
    const dungeonNames = new Map(dungeons.map((d) => [d.id, d.name]));

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
        workshopCount: gatherRows.length,
        minionsPlaced: gatherAssigned,
        minionOwned: gatherCount,
        maxMinions: GAME_RULES.minion.maxGatherOwned,
      },
      specialist: {
        workshopCount: specialistRows.length,
        crafting,
      },
      mercenaries: {
        count: dungeonCount,
        maxCount: GAME_RULES.minion.maxDungeonOwned,
        topLevel: dungeonMinions[0]?.level ?? null,
      },
      dungeon: {
        active: !!activeRun,
        name: activeRun ? dungeonNames.get(activeRun.dungeonId) ?? activeRun.dungeonId : null,
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
