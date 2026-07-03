import { prisma } from "@/server/db";
import { buildMinionCombatBreakdown } from "@/server/minionCombatBuild";
import { weaponCombatBonusFromOptions } from "@/server/itemOptions";
import { loadCatalogItemIdSet, isCatalogItemId } from "@/server/catalogItems";
import { referenceGoldPerUnit } from "@/server/itemReferenceGold";
import {
  armorIdsFromRow,
  buildArmorLoadoutFromIds,
  loadArmorInstanceMapForUser,
} from "@/server/minionArmorDb";
import { armorEquippedView } from "@/server/minionListBuild";
import { minionBaseStatsFromRow } from "@/shared/minionBaseStats";
import { minionRoleLabel } from "@/server/minionJobs";
import type { MinionCombatClass } from "@/shared/minionDerivedClass";
import { playerDisplayName } from "@/shared/minionNickname";
import { itemGradeViewForItem } from "@/server/itemGrade";
import { knightOrderToView } from "@/server/knightOrderView";
import { ZERO_KNIGHT_ORDER_BONUSES } from "@/shared/knightOrder";
import {
  feeBpsForSeller,
  sellerAuctionPendingSettlementWhere,
} from "@/server/market";
import type {
  MeDashboardLight,
  MeDashboardLeaderboardHighlight,
  MeDashboardPendingSale,
  MeDashboardRepresentativeMinion,
} from "@/shared/meDashboard";

const minionInclude = {
  traits: true,
  equippedWeaponInstance: { include: { baseItem: true } },
} as const;

function weaponEstimatedGold(baseItemId: string, enhanceLevel: number) {
  const base = referenceGoldPerUnit(baseItemId);
  const lv = Math.max(0, Math.floor(enhanceLevel));
  return Math.round(base * (1 + lv * 0.12));
}

type MinionRow = Awaited<
  ReturnType<typeof prisma.minion.findFirst<{ include: typeof minionInclude }>>
>;

function buildRepresentativeMinionView(
  m: NonNullable<MinionRow>,
  armorInstById: Awaited<ReturnType<typeof loadArmorInstanceMapForUser>>,
  playerUsername: string | null,
): MeDashboardRepresentativeMinion {
  const fighterRank = (m.traits ?? []).find((tr) => tr.type === "FIGHTER")?.rank ?? 0;
  const armorIds = armorIdsFromRow(m);
  const combatClass: MinionCombatClass = "ADVENTURER";
  const combatStats = buildMinionCombatBreakdown({
    level: 1,
    fighterRank,
    baseStats: minionBaseStatsFromRow(m),
    combatClass,
    weapon: m.equippedWeaponInstance
      ? {
          baseItemId: m.equippedWeaponInstance.baseItemId,
          enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
          optionsJson: m.equippedWeaponInstance.optionsJson,
        }
      : null,
    armor: buildArmorLoadoutFromIds(armorIds, armorInstById),
  });
  return {
    id: m.id,
    combatClassLabel: minionRoleLabel({ combatClass }),
    displayName: playerDisplayName(playerUsername, minionRoleLabel({ combatClass })),
    nickname: null,
    level: 1,
    unspentSkillPoints: 0,
    skills: [],
    equippedWeapon: m.equippedWeaponInstance?.baseItem
      ? {
          baseItemId: m.equippedWeaponInstance.baseItemId,
          name: m.equippedWeaponInstance.baseItem.name,
          enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
            ...itemGradeViewForItem(
              m.equippedWeaponInstance.baseItemId,
              m.equippedWeaponInstance.baseItem.grade,
            ),
        }
      : null,
    equippedArmor: armorEquippedView(armorIds, armorInstById),
    combatStats,
    traits: (m.traits ?? []).map((t) => ({ type: t.type, rank: t.rank })),
  };
}

async function loadSoloRepresentativeMinion(userId: string): Promise<MeDashboardRepresentativeMinion | null> {
  const [m, userAccount] = await Promise.all([
    prisma.minion.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: minionInclude,
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
  ]);
  if (!m) return null;
  const armorByMinionId = new Map([[m.id, armorIdsFromRow(m)]]);
  const armorInstById = await loadArmorInstanceMapForUser(prisma, userId, armorByMinionId);
  return buildRepresentativeMinionView(m, armorInstById, userAccount?.username ?? null);
}

export async function buildMeDashboardLight(
  userId: string,
  opts?: { lite?: boolean },
): Promise<MeDashboardLight> {
  const lite = opts?.lite ?? false;

  if (lite) {
    const [wallet, invAgg, weaponCount, pendingListingsRaw, representativeMinion] = await Promise.all([
      prisma.wallet.findUnique({ where: { userId } }),
      prisma.inventoryStack.aggregate({
        where: { userId, quantity: { gt: 0 } },
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      prisma.weaponInstance.count({ where: { userId, status: "OWNED" } }),
      prisma.listing.findMany({
        where: sellerAuctionPendingSettlementWhere(userId),
        orderBy: [{ endsAt: "asc" }, { createdAt: "asc" }],
        take: 5,
        include: { item: true, weaponInstance: { include: { baseItem: true } } },
      }),
      loadSoloRepresentativeMinion(userId),
    ]);

    const goldAvailable = wallet?.goldAvailable ?? 0;
    const goldLocked = wallet?.goldLocked ?? 0;
    const knightOrder = knightOrderToView(ZERO_KNIGHT_ORDER_BONUSES);

    const pendingSales: MeDashboardPendingSale[] = pendingListingsRaw.map((l) => {
      const weapon = l.weaponInstance;
      const highestBid = l.highestBid ?? 0;
      return {
        listingId: l.id,
        itemId: l.itemId,
        itemName: weapon?.baseItem.name ?? l.item.name,
        quantity: l.quantity,
        highestBid,
        expectedNetGold: highestBid,
        endsAt: l.endsAt?.toISOString() ?? null,
        enhanceLevel: weapon?.enhanceLevel ?? null,
      };
    });

    return {
      ok: true,
      assets: {
        goldAvailable,
        goldLocked,
        inventoryEstimatedGold: 0,
        weaponsEstimatedGold: 0,
        totalEstimatedGold: goldAvailable + goldLocked,
        inventoryKindCount: invAgg._count._all,
        inventoryTotalQty: invAgg._sum.quantity ?? 0,
        weaponCount,
      },
      pendingSales,
      representativeMinion,
      totalUnspentSkillPoints: 0,
      knightOrder,
      leaderboardHighlights: [],
    };
  }

  const catalogIds = await loadCatalogItemIdSet();
  const [
    wallet,
    stacks,
    weaponInstances,
    pendingListingsRaw,
    representativeMinion,
  ] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId } }),
    prisma.inventoryStack.findMany({
      where: { userId, quantity: { gt: 0 } },
      select: { itemId: true, quantity: true },
    }),
    prisma.weaponInstance.findMany({
      where: { userId, status: "OWNED" },
      select: { baseItemId: true, enhanceLevel: true },
    }),
    prisma.listing.findMany({
      where: sellerAuctionPendingSettlementWhere(userId),
      orderBy: [{ endsAt: "asc" }, { createdAt: "asc" }],
      take: 5,
      include: {
        item: true,
        weaponInstance: { include: { baseItem: true } },
      },
    }),
    loadSoloRepresentativeMinion(userId),
  ]);

  const knightOrder = knightOrderToView(ZERO_KNIGHT_ORDER_BONUSES);

  const catalogStacks = stacks.filter((s) => isCatalogItemId(s.itemId, catalogIds));
  const catalogWeapons = weaponInstances.filter((w) => isCatalogItemId(w.baseItemId, catalogIds));

  let inventoryEstimatedGold = 0;
  for (const s of catalogStacks) {
    inventoryEstimatedGold += referenceGoldPerUnit(s.itemId) * Math.max(0, s.quantity);
  }

  let weaponsEstimatedGold = 0;
  for (const w of catalogWeapons) {
    weaponsEstimatedGold += weaponEstimatedGold(w.baseItemId, w.enhanceLevel);
  }

  const goldAvailable = wallet?.goldAvailable ?? 0;
  const goldLocked = wallet?.goldLocked ?? 0;
  const totalEstimatedGold = goldAvailable + goldLocked + inventoryEstimatedGold + weaponsEstimatedGold;

  const pendingSales: MeDashboardPendingSale[] = await (async () => {
    if (pendingListingsRaw.length === 0) return [];
    const feeBps = await feeBpsForSeller(userId, prisma);
    return pendingListingsRaw.map((l) => {
      const weapon = l.weaponInstance;
      const itemName = weapon?.baseItem.name ?? l.item.name;
      const highestBid = l.highestBid ?? 0;
      const feeGold = Math.floor((highestBid * feeBps) / 10_000);
      return {
        listingId: l.id,
        itemId: l.itemId,
        itemName,
        quantity: l.quantity,
        highestBid,
        expectedNetGold: highestBid - feeGold,
        endsAt: l.endsAt?.toISOString() ?? null,
        enhanceLevel: weapon?.enhanceLevel ?? null,
      };
    });
  })();

  const totalUnspentSkillPoints = 0;
  // 랭킹 하이라이트는 bootstrap에서 제외 — 초기 로딩·DB 부하 완화
  const leaderboardHighlights: MeDashboardLeaderboardHighlight[] = [];

  return {
    ok: true,
    assets: {
      goldAvailable,
      goldLocked,
      inventoryEstimatedGold,
      weaponsEstimatedGold,
      totalEstimatedGold,
      inventoryKindCount: catalogStacks.length,
      inventoryTotalQty: catalogStacks.reduce((a, s) => a + s.quantity, 0),
      weaponCount: weaponInstances.length,
    },
    pendingSales,
    representativeMinion,
    totalUnspentSkillPoints,
    knightOrder,
    leaderboardHighlights,
  };
}

/** @deprecated light와 동일 — full/trends 제거 */
export async function buildMeDashboard(userId: string): Promise<MeDashboardLight> {
  return buildMeDashboardLight(userId);
}
