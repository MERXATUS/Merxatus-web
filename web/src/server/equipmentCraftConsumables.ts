import type { Prisma } from "@prisma/client";
import { runPrismaTransaction } from "@/server/db";
import { assertEquipmentNotUserLocked } from "@/server/inventoryEquipmentLock";
import { stackAvailableQty, takeAvailableFromStack } from "@/server/inventoryStackOps";
import { canApplyQualityCraft, clampEquipmentQuality } from "@/shared/equipmentQuality";
import {
  equipmentCraftConsumableKind,
  itemLevelTierForCraftKind,
  type EquipmentCraftConsumableKind,
} from "@/shared/equipmentCraftConsumables";
import { isItemLevelInTier, isValidItemLevel, normalizeItemLevel } from "@/shared/equipmentItemLevel";
import { normalizeItemIdLower } from "@/shared/itemId";

type EquipCategory = "weapon" | "armor";

export type ApplyEquipmentCraftInput = {
  userId: string;
  consumableItemId: string;
  targetKind: EquipCategory;
  targetInstanceId: string;
  chosenItemLevel?: number | null;
};

export type ApplyEquipmentCraftResult = {
  ok: true;
  kind: EquipmentCraftConsumableKind;
  targetKind: EquipCategory;
  targetInstanceId: string;
  quality: number;
  qualityCraftCount: number;
  itemLevel: number;
};

async function loadInstance(
  tx: Prisma.TransactionClient,
  userId: string,
  targetKind: EquipCategory,
  targetInstanceId: string,
) {
  if (targetKind === "weapon") {
    const row = await tx.weaponInstance.findUnique({ where: { id: targetInstanceId } });
    if (!row || row.userId !== userId) throw new Error("NOT_FOUND");
    if (row.status !== "OWNED") throw new Error("EQUIPMENT_LOCKED");
    assertEquipmentNotUserLocked(row);
    return { kind: "weapon" as const, row };
  }
  const row = await tx.armorInstance.findUnique({ where: { id: targetInstanceId } });
  if (!row || row.userId !== userId) throw new Error("NOT_FOUND");
  if (row.status !== "OWNED") throw new Error("EQUIPMENT_LOCKED");
  assertEquipmentNotUserLocked(row);
  return { kind: "armor" as const, row };
}

export async function applyEquipmentCraftConsumable(
  input: ApplyEquipmentCraftInput,
): Promise<ApplyEquipmentCraftResult> {
  const consumableId = normalizeItemIdLower(input.consumableItemId);
  const kind = equipmentCraftConsumableKind(consumableId);
  if (!kind) throw new Error("NOT_CRAFT_CONSUMABLE");

  const targetId = input.targetInstanceId.trim();
  if (!targetId) throw new Error("BAD_REQUEST");

  return runPrismaTransaction(async (tx) => {
    const stack = await tx.inventoryStack.findUnique({
      where: { userId_itemId: { userId: input.userId, itemId: consumableId } },
    });
    if (!stack || stackAvailableQty(stack) < 1) {
      throw new Error(stack && stack.quantity >= 1 ? "ITEM_LOCKED" : "NO_CONSUMABLE");
    }

    const target = await loadInstance(tx, input.userId, input.targetKind, targetId);
    const row = target.row;

    let quality = clampEquipmentQuality(row.quality);
    let qualityCraftCount = Math.max(0, Math.floor(row.qualityCraftCount));
    let itemLevel = normalizeItemLevel(row.itemLevel);

    if (kind === "quality_up") {
      if (!canApplyQualityCraft(quality, qualityCraftCount)) throw new Error("QUALITY_CRAFT_LIMIT");
      quality += 1;
      qualityCraftCount += 1;
    } else {
      const tier = itemLevelTierForCraftKind(kind);
      if (!tier) throw new Error("BAD_REQUEST");
      if (!isValidItemLevel(input.chosenItemLevel)) throw new Error("ITEM_LEVEL_REQUIRED");
      const chosen = normalizeItemLevel(input.chosenItemLevel);
      if (!isItemLevelInTier(chosen, tier)) throw new Error("ITEM_LEVEL_TIER_MISMATCH");
      itemLevel = chosen;
    }

    if (target.kind === "weapon") {
      await tx.weaponInstance.update({
        where: { id: row.id },
        data: { quality, qualityCraftCount, itemLevel },
      });
    } else {
      await tx.armorInstance.update({
        where: { id: row.id },
        data: { quality, qualityCraftCount, itemLevel },
      });
    }

    await takeAvailableFromStack(tx, input.userId, consumableId, 1);

    return {
      ok: true as const,
      kind,
      targetKind: input.targetKind,
      targetInstanceId: row.id,
      quality,
      qualityCraftCount,
      itemLevel,
    };
  });
}
