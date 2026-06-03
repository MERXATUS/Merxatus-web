import { prisma } from "@/server/db";
import { buildMinionCombatBreakdown } from "@/server/minionCombatBuild";
import { weaponCombatBonusFromOptions } from "@/server/itemOptions";
import { loadCatalogItemIdSet, isCatalogItemId } from "@/server/catalogItems";
import { referenceGoldPerUnit } from "@/server/itemReferenceGold";
import { armorIdsFromRow, loadMinionArmorIdsForUser } from "@/server/minionArmorDb";
import { minionBaseStatsFromRow } from "@/shared/minionBaseStats";
import { minionRoleLabel } from "@/server/minionJobs";
import { promotionStateFromRow, resolveMinionCombatClass } from "@/shared/minionPromotion";
import {
  armorSlotsFromMinionRow,
  computeMinionCombatPower,
} from "@/shared/minionCombatStats";
import { getArmorStats } from "@/shared/armorStatsData";
import {
  feeBpsForSeller,
  sellerAuctionPendingSettlementWhere,
} from "@/server/market";
import type {
  MeDashboard,
  MeDashboardGoldDay,
  MeDashboardGoldTrend,
  MeDashboardPendingSale,
  MeDashboardStrongestMinion,
} from "@/shared/meDashboard";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildDayRange(count: number, now = new Date()): Date[] {
  const today = startOfDay(now);
  const days: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function labelForDay(d: Date, mode: "week" | "month") {
  if (mode === "week") return WEEKDAY_KO[d.getDay()] ?? "";
  return String(d.getDate());
}

function aggregateGoldTrend(
  days: Date[],
  mode: "week" | "month",
  txs: Array<{ buyerId: string; sellerId: string; grossGold: number; netGold: number; createdAt: Date }>,
  userId: string,
): { points: MeDashboardGoldDay[]; netTotal: number } {
  const netByDay = new Map<string, number>();
  for (const d of days) netByDay.set(dayKey(d), 0);

  for (const t of txs) {
    const key = dayKey(t.createdAt);
    if (!netByDay.has(key)) continue;
    const prev = netByDay.get(key) ?? 0;
    if (t.sellerId === userId) netByDay.set(key, prev + t.netGold);
    else if (t.buyerId === userId) netByDay.set(key, prev - t.grossGold);
  }

  const points = days.map((d) => {
    const key = dayKey(d);
    return {
      date: key,
      label: labelForDay(d, mode),
      netGold: netByDay.get(key) ?? 0,
    };
  });
  const netTotal = points.reduce((a, d) => a + d.netGold, 0);
  return { points, netTotal };
}

function weaponEstimatedGold(baseItemId: string, enhanceLevel: number) {
  const base = referenceGoldPerUnit(baseItemId);
  const lv = Math.max(0, Math.floor(enhanceLevel));
  return Math.round(base * (1 + lv * 0.12));
}

function armorPiece(itemId: string | null | undefined) {
  if (!itemId) return null;
  const stats = getArmorStats(itemId);
  return {
    itemId,
    name: stats?.name ?? itemId,
    grade: stats?.grade ?? 1,
  };
}

export async function buildMeDashboard(userId: string): Promise<MeDashboard> {
  const weekDays = buildDayRange(7);
  const monthDays = buildDayRange(30);
  const monthStart = monthDays[0]!;

  const catalogIds = await loadCatalogItemIdSet();

  const [
    wallet,
    stacks,
    weaponInstances,
    monthTxs,
    pendingListingsRaw,
    minions,
    armorByMinionId,
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
    prisma.transaction.findMany({
      where: {
        createdAt: { gte: monthStart },
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      select: {
        buyerId: true,
        sellerId: true,
        grossGold: true,
        netGold: true,
        createdAt: true,
      },
      take: 2000,
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
    prisma.minion.findMany({
      where: { userId },
      include: {
        traits: true,
        equippedWeaponInstance: { include: { baseItem: true } },
      },
      take: 200,
    }),
    loadMinionArmorIdsForUser(prisma, userId),
  ]);

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

  const weekAgg = aggregateGoldTrend(weekDays, "week", monthTxs, userId);
  const monthAgg = aggregateGoldTrend(monthDays, "month", monthTxs, userId);
  const goldTrend: MeDashboardGoldTrend = {
    week: weekAgg.points,
    weekNetGold: weekAgg.netTotal,
    month: monthAgg.points,
    monthNetGold: monthAgg.netTotal,
  };

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

  let strongestMinion: MeDashboardStrongestMinion | null = null;
  let topPower = -1;
  let strongestRow: (typeof minions)[number] | null = null;

  for (const m of minions) {
    const fighterRank = (m.traits ?? []).find((tr) => tr.type === "FIGHTER")?.rank ?? 0;
    const armorIds = armorIdsFromRow(armorByMinionId.get(m.id));
    const power = computeMinionCombatPower({
      level: m.level ?? 1,
      fighterRank,
      baseStats: minionBaseStatsFromRow(m),
      weapon: m.equippedWeaponInstance
        ? {
            baseItemId: m.equippedWeaponInstance.baseItemId,
            enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
            optionBonus: weaponCombatBonusFromOptions(m.equippedWeaponInstance.optionsJson),
          }
        : null,
      armor: armorSlotsFromMinionRow(armorIds),
    });
    if (power <= topPower) continue;
    topPower = power;
    strongestRow = m;
  }

  if (strongestRow) {
    const m = strongestRow;
    const fighterRank = (m.traits ?? []).find((tr) => tr.type === "FIGHTER")?.rank ?? 0;
    const armorIds = armorIdsFromRow(armorByMinionId.get(m.id));
    const combatStats = buildMinionCombatBreakdown({
      level: m.level ?? 1,
      fighterRank,
      baseStats: minionBaseStatsFromRow(m),
      weapon: m.equippedWeaponInstance
        ? {
            baseItemId: m.equippedWeaponInstance.baseItemId,
            enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
            optionsJson: m.equippedWeaponInstance.optionsJson,
          }
        : null,
      armor: armorSlotsFromMinionRow(armorIds),
    });
    const combatClassLabel = minionRoleLabel({
      combatClass: resolveMinionCombatClass(promotionStateFromRow(m)),
    });
    strongestMinion = {
      id: m.id,
      combatClassLabel,
      level: m.level ?? 1,
      equippedWeapon: m.equippedWeaponInstance?.baseItem
        ? {
            baseItemId: m.equippedWeaponInstance.baseItemId,
            name: m.equippedWeaponInstance.baseItem.name,
            enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
            grade: m.equippedWeaponInstance.baseItem.grade,
          }
        : null,
      equippedArmor: {
        helmet: armorPiece(armorIds.equippedHelmetItemId),
        armor: armorPiece(armorIds.equippedChestItemId),
        pants: armorPiece(armorIds.equippedPantsItemId),
        shoes: armorPiece(armorIds.equippedBootsItemId),
      },
      combatStats,
      traits: (m.traits ?? []).map((t) => ({ type: t.type, rank: t.rank })),
    };
  }

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
    goldTrend,
    pendingSales,
    strongestMinion,
  };
}
