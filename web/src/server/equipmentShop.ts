import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { isCatalogItemId, loadCatalogItemIdSet, loadCatalogItemNameMap } from "@/server/catalogItems";
import { loadEquippedMinionByInstanceMaps } from "@/server/equipmentEquippedByMinion";
import { formatEquipmentOptionDisplay, parseEquipmentOptionsPayload } from "@/server/equipmentOptions";
import { honorTitleForPoints } from "@/server/honorTitles";
import { attachIcons, getItemIconMap } from "@/server/itemCatalog";
import { itemGradeViewForItem } from "@/server/itemGrade";
import { assertEquipmentNotUserLocked } from "@/server/inventoryEquipmentLock";
import { GAME_RULES } from "@/server/gameRules";
import { normalizeItemIdLower } from "@/shared/itemId";
import { armorTotalPower, type ArmorTooltipOption } from "@/shared/armorTooltip";
import { equipmentShopBuybackGold } from "@/shared/equipmentShopPricing";
import { weaponTotalPower, type WeaponTooltipOption } from "@/shared/weaponTooltip";
import type { EquippedByMinionView } from "@/shared/equipmentEquippedBy";

type ShopTx = Prisma.TransactionClient;
type EquipKind = "weapon" | "armor";

export type EquipmentShopBlockedReason =
  | "EQUIPMENT_EQUIPPED"
  | "EQUIPMENT_LOCKED"
  | "ITEM_USER_LOCKED";

export type EquipmentShopRow = {
  kind: EquipKind;
  instanceId: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  quality: number;
  itemLevel: number;
  grade: number;
  gradeLabel: string;
  identified: boolean;
  combatPower: number;
  buybackGold: number;
  sellable: boolean;
  blockedReason: EquipmentShopBlockedReason | null;
  equippedByMinion: EquippedByMinionView | null;
  options: WeaponTooltipOption[] | ArmorTooltipOption[];
  icon?: string | null;
  iconSrc?: string;
};

export type EquipmentShopPayload = {
  ok: true;
  goldAvailable: number;
  goldPerCombatPower: number;
  items: EquipmentShopRow[];
};

export type EquipmentShopSellTarget = { kind: EquipKind; instanceId: string };

export type EquipmentShopSellResult = {
  ok: true;
  soldCount: number;
  goldGained: number;
  honorDelta: number;
};

function honorDeltaForShopSale(grossGold: number) {
  return Math.max(1, Math.floor(Math.max(0, grossGold) / 1000));
}

function weaponCombatPowerFromRow(row: {
  baseItemId: string;
  enhanceLevel: number;
  quality: number;
  itemLevel: number;
  options: WeaponTooltipOption[];
}) {
  return weaponTotalPower({
    id: "",
    baseItemId: row.baseItemId,
    name: "",
    enhanceLevel: row.enhanceLevel,
    quality: row.quality,
    itemLevel: row.itemLevel,
    options: row.options,
  });
}

function armorCombatPowerFromRow(row: {
  baseItemId: string;
  enhanceLevel: number;
  quality: number;
  itemLevel: number;
  options: ArmorTooltipOption[];
}) {
  return armorTotalPower({
    id: "",
    baseItemId: row.baseItemId,
    name: "",
    enhanceLevel: row.enhanceLevel,
    quality: row.quality,
    itemLevel: row.itemLevel,
    options: row.options,
  });
}

function sellBlockReasonFromError(code: string): EquipmentShopBlockedReason | null {
  if (code === "EQUIPMENT_EQUIPPED") return "EQUIPMENT_EQUIPPED";
  if (code === "EQUIPMENT_LOCKED") return "EQUIPMENT_LOCKED";
  if (code === "ITEM_USER_LOCKED") return "ITEM_USER_LOCKED";
  return null;
}

async function evaluateWeaponSellable(
  tx: ShopTx,
  userId: string,
  instanceId: string,
): Promise<{ sellable: true } | { sellable: false; reason: EquipmentShopBlockedReason }> {
  try {
    const w = await tx.weaponInstance.findUnique({
      where: { id: instanceId },
      include: { listing: { select: { id: true } } },
    });
    if (!w || w.userId !== userId) throw new Error("NOT_FOUND");
    if (w.status !== "OWNED" || w.listing) throw new Error("EQUIPMENT_LOCKED");
    assertEquipmentNotUserLocked(w);
    const equipped = await tx.minion.findFirst({
      where: { userId, equippedWeaponInstanceId: instanceId },
      select: { id: true },
    });
    if (equipped) throw new Error("EQUIPMENT_EQUIPPED");
    return { sellable: true };
  } catch (e) {
    const code = e instanceof Error ? e.message : "EQUIPMENT_LOCKED";
    const reason = sellBlockReasonFromError(code);
    if (reason) return { sellable: false, reason };
    throw e;
  }
}

async function evaluateArmorSellable(
  tx: ShopTx,
  userId: string,
  instanceId: string,
): Promise<{ sellable: true } | { sellable: false; reason: EquipmentShopBlockedReason }> {
  try {
    const a = await tx.armorInstance.findUnique({ where: { id: instanceId } });
    if (!a || a.userId !== userId) throw new Error("NOT_FOUND");
    if (a.status !== "OWNED") throw new Error("EQUIPMENT_LOCKED");
    assertEquipmentNotUserLocked(a);
    const equipped = await tx.minion.findFirst({
      where: {
        userId,
        OR: [
          { equippedHelmetInstanceId: instanceId },
          { equippedChestInstanceId: instanceId },
          { equippedPantsInstanceId: instanceId },
          { equippedBootsInstanceId: instanceId },
        ],
      },
      select: { id: true },
    });
    if (equipped) throw new Error("EQUIPMENT_EQUIPPED");
    return { sellable: true };
  } catch (e) {
    const code = e instanceof Error ? e.message : "EQUIPMENT_LOCKED";
    const reason = sellBlockReasonFromError(code);
    if (reason) return { sellable: false, reason };
    throw e;
  }
}

export async function listEquipmentShop(userId: string): Promise<EquipmentShopPayload> {
  const [catalogIds, catalogNames, iconMap, wallet, weaponRows, armorRows, equippedMaps] = await Promise.all([
    loadCatalogItemIdSet(),
    loadCatalogItemNameMap(),
    getItemIconMap(),
    prisma.wallet.findUnique({ where: { userId }, select: { goldAvailable: true } }),
    prisma.weaponInstance.findMany({
      where: { userId, status: "OWNED" },
      include: { baseItem: true, listing: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.armorInstance.findMany({
      where: { userId, status: "OWNED" },
      include: { baseItem: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    loadEquippedMinionByInstanceMaps(userId),
  ]);

  const items: EquipmentShopRow[] = [];

  for (const w of weaponRows) {
    if (!isCatalogItemId(w.baseItemId, catalogIds)) continue;
    const gradeView = itemGradeViewForItem(w.baseItemId, w.baseItem.grade);
    const options = formatEquipmentOptionDisplay(w.optionsJson, "weapon");
    const combatPower = weaponCombatPowerFromRow({
      baseItemId: w.baseItemId,
      enhanceLevel: w.enhanceLevel ?? 0,
      quality: w.quality ?? 0,
      itemLevel: w.itemLevel ?? 10,
      options,
    });
    let sellable = true;
    let blockedReason: EquipmentShopBlockedReason | null = null;
    if (w.listing) {
      sellable = false;
      blockedReason = "EQUIPMENT_LOCKED";
    } else if (w.userLocked) {
      sellable = false;
      blockedReason = "ITEM_USER_LOCKED";
    } else if (equippedMaps.weaponByInstanceId.has(w.id)) {
      sellable = false;
      blockedReason = "EQUIPMENT_EQUIPPED";
    }
    items.push({
      kind: "weapon",
      instanceId: w.id,
      baseItemId: w.baseItemId,
      name: catalogNames.get(normalizeItemIdLower(w.baseItemId)) ?? w.baseItem.name,
      enhanceLevel: w.enhanceLevel ?? 0,
      quality: w.quality ?? 0,
      itemLevel: w.itemLevel ?? 10,
      ...gradeView,
      identified: parseEquipmentOptionsPayload(w.optionsJson).identified,
      combatPower,
      buybackGold: equipmentShopBuybackGold(combatPower),
      sellable,
      blockedReason,
      equippedByMinion: equippedMaps.weaponByInstanceId.get(w.id) ?? null,
      options,
    });
  }

  for (const a of armorRows) {
    if (!isCatalogItemId(a.baseItemId, catalogIds)) continue;
    const gradeView = itemGradeViewForItem(a.baseItemId, a.baseItem.grade);
    const options = formatEquipmentOptionDisplay(a.optionsJson, "armor");
    const combatPower = armorCombatPowerFromRow({
      baseItemId: a.baseItemId,
      enhanceLevel: a.enhanceLevel ?? 0,
      quality: a.quality ?? 0,
      itemLevel: a.itemLevel ?? 10,
      options,
    });
    let sellable = true;
    let blockedReason: EquipmentShopBlockedReason | null = null;
    if (a.userLocked) {
      sellable = false;
      blockedReason = "ITEM_USER_LOCKED";
    } else if (equippedMaps.armorByInstanceId.has(a.id)) {
      sellable = false;
      blockedReason = "EQUIPMENT_EQUIPPED";
    }
    items.push({
      kind: "armor",
      instanceId: a.id,
      baseItemId: a.baseItemId,
      name: catalogNames.get(normalizeItemIdLower(a.baseItemId)) ?? a.baseItem.name,
      enhanceLevel: a.enhanceLevel ?? 0,
      quality: a.quality ?? 0,
      itemLevel: a.itemLevel ?? 10,
      ...gradeView,
      identified: parseEquipmentOptionsPayload(a.optionsJson).identified,
      combatPower,
      buybackGold: equipmentShopBuybackGold(combatPower),
      sellable,
      blockedReason,
      equippedByMinion: equippedMaps.armorByInstanceId.get(a.id) ?? null,
      options,
    });
  }

  items.sort((a, b) => b.buybackGold - a.buybackGold || b.combatPower - a.combatPower);

  const withIcons = await attachIcons(items, iconMap, "baseItemId");

  return {
    ok: true,
    goldAvailable: wallet?.goldAvailable ?? 0,
    goldPerCombatPower: GAME_RULES.equipmentShop.goldPerCombatPower,
    items: withIcons,
  };
}

function dedupeTargets(targets: EquipmentShopSellTarget[]): EquipmentShopSellTarget[] {
  const seen = new Set<string>();
  const out: EquipmentShopSellTarget[] = [];
  for (const t of targets) {
    const key = `${t.kind}:${t.instanceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export async function sellEquipmentToShop(
  tx: ShopTx,
  input: { userId: string; targets: EquipmentShopSellTarget[] },
): Promise<EquipmentShopSellResult> {
  const targets = dedupeTargets(input.targets);
  if (targets.length === 0) throw new Error("BAD_REQUEST");
  if (targets.length > GAME_RULES.equipmentShop.maxSellBatch) throw new Error("SHOP_SELL_BATCH_TOO_LARGE");

  let goldGained = 0;
  for (const target of targets) {
    const allowed =
      target.kind === "weapon"
        ? await evaluateWeaponSellable(tx, input.userId, target.instanceId)
        : await evaluateArmorSellable(tx, input.userId, target.instanceId);
    if (!allowed.sellable) throw new Error(allowed.reason);

    if (target.kind === "weapon") {
      const w = await tx.weaponInstance.findUnique({
        where: { id: target.instanceId },
        include: { baseItem: true },
      });
      if (!w) throw new Error("NOT_FOUND");
      const options = formatEquipmentOptionDisplay(w.optionsJson, "weapon");
      const combatPower = weaponCombatPowerFromRow({
        baseItemId: w.baseItemId,
        enhanceLevel: w.enhanceLevel ?? 0,
        quality: w.quality ?? 0,
        itemLevel: w.itemLevel ?? 10,
        options,
      });
      goldGained += equipmentShopBuybackGold(combatPower);
      await tx.weaponInstance.delete({ where: { id: target.instanceId } });
    } else {
      const a = await tx.armorInstance.findUnique({
        where: { id: target.instanceId },
        include: { baseItem: true },
      });
      if (!a) throw new Error("NOT_FOUND");
      const options = formatEquipmentOptionDisplay(a.optionsJson, "armor");
      const combatPower = armorCombatPowerFromRow({
        baseItemId: a.baseItemId,
        enhanceLevel: a.enhanceLevel ?? 0,
        quality: a.quality ?? 0,
        itemLevel: a.itemLevel ?? 10,
        options,
      });
      goldGained += equipmentShopBuybackGold(combatPower);
      await tx.armorInstance.delete({ where: { id: a.id } });
    }
  }

  const honorDelta = honorDeltaForShopSale(goldGained);
  const user = await tx.user.findUnique({
    where: { id: input.userId },
    select: { honorPoints: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  await tx.wallet.update({
    where: { userId: input.userId },
    data: { goldAvailable: { increment: goldGained } },
  });

  const nextHonor = Math.max(0, Math.floor((user.honorPoints ?? 0) + honorDelta));
  await tx.user.update({
    where: { id: input.userId },
    data: { honorPoints: nextHonor, honorTitle: honorTitleForPoints(nextHonor) },
  });

  return {
    ok: true,
    soldCount: targets.length,
    goldGained,
    honorDelta,
  };
}

export async function sellEquipmentToShopTransaction(input: {
  userId: string;
  targets: EquipmentShopSellTarget[];
}) {
  return prisma.$transaction(async (tx) => sellEquipmentToShop(tx, input));
}
