import { prisma } from "@/server/db";
import { getTutorialState } from "@/server/tutorialProgress";
import { tutorialProgressPercent } from "@/shared/tutorial";
import { itemGradeViewForItem } from "@/server/itemGrade";
import { isCatalogItemId, loadCatalogItemIdSet } from "@/server/catalogItems";
import { attachIcons, getItemIconMap, itemIconFieldsFromMap } from "@/server/itemCatalog";
import { formatEquipmentOptionDisplay, parseEquipmentOptionsPayload } from "@/server/equipmentOptions";
import { GAME_RULES } from "@/server/gameRules";
import { countOwnedEquipment } from "@/server/equipmentCapacity";
import { MAX_EQUIPMENT_OWNED } from "@/shared/equipmentCapacity";

export type MeStateScope = "inventory" | "weapons" | "armor" | "market" | "full";

function mapWeaponRows(
  weaponInstances: Array<{
    id: string;
    baseItemId: string;
    enhanceLevel: number;
    createdAt: Date;
    optionsJson: string;
    baseItem: { name: string; grade: number };
  }>,
  catalogIds: Set<string>,
  iconMap: Awaited<ReturnType<typeof getItemIconMap>>,
) {
  return attachIcons(
    weaponInstances
      .filter((w) => isCatalogItemId(w.baseItemId, catalogIds))
      .map((w) => ({
        id: w.id,
        baseItemId: w.baseItemId,
        name: w.baseItem.name,
        enhanceLevel: w.enhanceLevel,
        createdAt: w.createdAt,
        ...itemGradeViewForItem(w.baseItemId, w.baseItem.grade),
        identified: parseEquipmentOptionsPayload(w.optionsJson).identified,
        options: formatEquipmentOptionDisplay(w.optionsJson, "weapon"),
      })),
    iconMap,
    "baseItemId",
  );
}

function mapArmorRows(
  armorInstances: Array<{
    id: string;
    baseItemId: string;
    enhanceLevel: number;
    createdAt: Date;
    optionsJson: string;
    baseItem: { name: string; grade: number };
  }>,
  catalogIds: Set<string>,
  iconMap: Awaited<ReturnType<typeof getItemIconMap>>,
) {
  return attachIcons(
    armorInstances
      .filter((a) => isCatalogItemId(a.baseItemId, catalogIds))
      .map((a) => ({
        id: a.id,
        baseItemId: a.baseItemId,
        name: a.baseItem.name,
        enhanceLevel: a.enhanceLevel,
        createdAt: a.createdAt,
        ...itemGradeViewForItem(a.baseItemId, a.baseItem.grade),
        identified: parseEquipmentOptionsPayload(a.optionsJson).identified,
        options: formatEquipmentOptionDisplay(a.optionsJson, "armor"),
      })),
    iconMap,
    "baseItemId",
  );
}

async function buildInventoryScope(userId: string, catalogIds: Set<string>) {
  const [userAccount, tutorial, wallet, stacks, equipmentOwnedCount, iconMap] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
    getTutorialState(prisma, userId),
    prisma.wallet.findUnique({ where: { userId } }),
    prisma.inventoryStack.findMany({
      where: { userId },
      include: { item: true },
      orderBy: [{ itemId: "asc" }],
    }),
    countOwnedEquipment(prisma, userId),
    getItemIconMap(),
  ]);

  const inventory = attachIcons(
    stacks
      .filter((s) => isCatalogItemId(s.itemId, catalogIds))
      .map((s) => ({
        itemId: s.itemId,
        name: s.item.name,
        category: s.item.category,
        quantity: s.quantity,
        ...itemGradeViewForItem(s.itemId, s.item.grade),
      })),
    iconMap,
    "itemId",
  );

  return {
    ok: true as const,
    username: userAccount?.username ?? null,
    tutorialStep: tutorial.step,
    tutorialDone: tutorial.done,
    tutorialProgressPercent: tutorialProgressPercent(tutorial.step),
    wallet: wallet ?? { userId, goldAvailable: 0, goldLocked: 0 },
    inventory,
    equipment: {
      ownedCount: equipmentOwnedCount,
      maxOwned: MAX_EQUIPMENT_OWNED,
    },
  };
}

async function buildWeaponsScope(userId: string, catalogIds: Set<string>) {
  const [weaponInstances, iconMap] = await Promise.all([
    prisma.weaponInstance.findMany({
      where: { userId },
      include: { baseItem: true },
      orderBy: [{ createdAt: "asc" }],
      take: 500,
    }),
    getItemIconMap(),
  ]);

  return {
    ok: true as const,
    weaponInstances: mapWeaponRows(weaponInstances, catalogIds, iconMap),
  };
}

async function buildArmorScope(userId: string, catalogIds: Set<string>) {
  const [armorInstances, iconMap] = await Promise.all([
    prisma.armorInstance.findMany({
      where: { userId, status: "OWNED" },
      include: { baseItem: true },
      orderBy: [{ createdAt: "asc" }],
      take: 500,
    }),
    getItemIconMap(),
  ]);

  return {
    ok: true as const,
    armorInstances: mapArmorRows(armorInstances, catalogIds, iconMap),
  };
}

async function buildMarketScope(userId: string) {
  const [listings, iconMap] = await Promise.all([
    prisma.listing.findMany({
      where: { sellerId: userId, status: "ACTIVE" },
      include: { item: true, weaponInstance: { include: { baseItem: true } } },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
    }),
    getItemIconMap(),
  ]);

  return {
    ok: true as const,
    market: {
      maxActiveListings: GAME_RULES.market.maxActiveListingsPerUser,
      listingDurationHours: GAME_RULES.market.listingDurationSeconds / 3600,
      activeListingCount: listings.length,
    },
    myListings: listings.map((l) => {
      const iconItemId = l.weaponInstance?.baseItemId ?? l.itemId;
      const { icon, iconSrc } = itemIconFieldsFromMap(iconItemId, iconMap);
      return {
        id: l.id,
        saleType: l.saleType,
        itemId: l.itemId,
        itemName: l.weaponInstance?.baseItem.name ?? l.item.name,
        quantity: l.quantity,
        fixedPricePerUnit: l.fixedPricePerUnit,
        fixedPriceTotal: l.fixedPriceTotal,
        startPrice: l.startPrice,
        endsAt: l.endsAt?.toISOString() ?? null,
        highestBid: l.highestBid,
        weaponInstanceId: l.weaponInstanceId,
        enhanceLevel: l.weaponInstance?.enhanceLevel ?? null,
        icon,
        iconSrc,
      };
    }),
  };
}

export async function buildMeState(userId: string, scope: MeStateScope) {
  const catalogIds = await loadCatalogItemIdSet();

  if (scope === "inventory") return buildInventoryScope(userId, catalogIds);
  if (scope === "weapons") return buildWeaponsScope(userId, catalogIds);
  if (scope === "armor") return buildArmorScope(userId, catalogIds);
  if (scope === "market") return buildMarketScope(userId);

  const [inventory, weapons, armor, market] = await Promise.all([
    buildInventoryScope(userId, catalogIds),
    buildWeaponsScope(userId, catalogIds),
    buildArmorScope(userId, catalogIds),
    buildMarketScope(userId),
  ]);

  return {
    ok: true as const,
    username: inventory.username,
    tutorialStep: inventory.tutorialStep,
    tutorialDone: inventory.tutorialDone,
    tutorialProgressPercent: inventory.tutorialProgressPercent,
    wallet: inventory.wallet,
    inventory: inventory.inventory,
    equipment: inventory.equipment,
    weaponInstances: weapons.weaponInstances,
    armorInstances: armor.armorInstances,
    market: market.market,
    myListings: market.myListings,
  };
}
