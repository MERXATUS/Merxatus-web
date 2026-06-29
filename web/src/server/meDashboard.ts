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
import { promotionStateFromRow, resolveMinionCombatClass } from "@/shared/minionPromotion";
import { skillViewsForMinion } from "@/shared/minionSkills";
import { minionDisplayName } from "@/shared/minionNickname";
import { itemGradeViewForItem } from "@/server/itemGrade";
import { loadKnightOrderBonuses } from "@/server/knightOrder";
import { knightOrderToView } from "@/server/knightOrderView";
import {
  feeBpsForSeller,
  sellerAuctionPendingSettlementWhere,
} from "@/server/market";
import { buildLeaderboardHighlights } from "@/server/leaderboardHighlights";
import type {
  MeDashboardLight,
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
): MeDashboardRepresentativeMinion {
  const fighterRank = (m.traits ?? []).find((tr) => tr.type === "FIGHTER")?.rank ?? 0;
  const armorIds = armorIdsFromRow(m);
  const combatClass = resolveMinionCombatClass(promotionStateFromRow(m));
  const combatStats = buildMinionCombatBreakdown({
    level: m.level ?? 1,
    fighterRank,
    baseStats: minionBaseStatsFromRow(m),
    combatClass,
    skillLevelsJson: m.skillLevelsJson,
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
    displayName: minionDisplayName(m.nickname, minionRoleLabel({ combatClass })),
    nickname: m.nickname ?? null,
    level: m.level ?? 1,
    unspentSkillPoints: Math.max(0, Math.floor(m.unspentSkillPoints ?? 0)),
    skills: skillViewsForMinion({ combatClass, skillLevelsJson: m.skillLevelsJson }),
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

export async function buildMeDashboardLight(userId: string): Promise<MeDashboardLight> {
  const catalogIds = await loadCatalogItemIdSet();
  const [
    wallet,
    stacks,
    weaponInstances,
    pendingListingsRaw,
    knightOrderRaw,
    userRow,
    skillAgg,
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
    loadKnightOrderBonuses(prisma, userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { representativeMinionId: true },
    }),
    prisma.minion.aggregate({
      where: { userId },
      _sum: { unspentSkillPoints: true },
    }),
  ]);

  const knightOrder = knightOrderToView(knightOrderRaw);
  const repId = userRow?.representativeMinionId ?? null;

  let representativeMinion: MeDashboardRepresentativeMinion | null = null;
  if (repId) {
    const m = await prisma.minion.findFirst({
      where: { id: repId, userId },
      include: minionInclude,
    });
    if (m) {
      const armorByMinionId = new Map([[m.id, armorIdsFromRow(m)]]);
      const armorInstById = await loadArmorInstanceMapForUser(prisma, userId, armorByMinionId);
      representativeMinion = buildRepresentativeMinionView(m, armorInstById);
    }
  }

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

  const totalUnspentSkillPoints = Math.max(0, Math.floor(skillAgg._sum.unspentSkillPoints ?? 0));
  const leaderboardHighlights = await buildLeaderboardHighlights(userId);

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
