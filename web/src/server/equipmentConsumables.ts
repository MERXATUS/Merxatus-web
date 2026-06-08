import type { Prisma } from "@prisma/client";
import { runPrismaTransaction } from "@/server/db";
import {
  appraisePayload,
  formatEquipmentOptionDisplay,
  parseEquipmentOptionsPayload,
  removeRandomUnlockedOption,
  rerollOptionIdsKeepingTiersInPayload,
  sealRandomUnlockedSlot,
  serializeEquipmentOptionsPayload,
} from "@/server/equipmentOptions";
import { resolveDisplayItemGrade } from "@/server/itemGrade";
import { optionConsumableKind, type OptionConsumableKind, ITEM_APPRAISAL_SCROLL } from "@/shared/optionConsumables";
import { normalizeItemIdLower } from "@/shared/itemId";

type EquipCategory = "weapon" | "armor";

export type ApplyEquipmentConsumableInput = {
  userId: string;
  consumableItemId: string;
  targetKind: EquipCategory;
  targetInstanceId: string;
};

export type ApplyEquipmentConsumableResult = {
  ok: true;
  kind: OptionConsumableKind;
  targetKind: EquipCategory;
  targetInstanceId: string;
  optionsJson: string;
  options: ReturnType<typeof formatEquipmentOptionDisplay>;
  identified: boolean;
  lockedIndices: number[];
};

function equipmentCategory(baseItemId: string, itemCategory: string): EquipCategory | null {
  const id = baseItemId.trim().toLowerCase();
  if (itemCategory === "무기" || id.startsWith("weapon_")) return "weapon";
  if (itemCategory === "방어구" || id.startsWith("armor_")) return "armor";
  return null;
}

async function loadTarget(
  tx: Prisma.TransactionClient,
  userId: string,
  targetKind: EquipCategory,
  targetInstanceId: string,
) {
  if (targetKind === "weapon") {
    const w = await tx.weaponInstance.findUnique({
      where: { id: targetInstanceId },
      include: { baseItem: true },
    });
    if (!w || w.userId !== userId) throw new Error("NOT_FOUND");
    if (w.status !== "OWNED") throw new Error("EQUIPMENT_LOCKED");
    return {
      kind: "weapon" as const,
      row: w,
      category: "weapon" as const,
      grade: resolveDisplayItemGrade(w.baseItemId, w.baseItem.grade),
    };
  }
  const a = await tx.armorInstance.findUnique({
    where: { id: targetInstanceId },
    include: { baseItem: true },
  });
  if (!a || a.userId !== userId) throw new Error("NOT_FOUND");
  if (a.status !== "OWNED") throw new Error("EQUIPMENT_LOCKED");
  return {
    kind: "armor" as const,
    row: a,
    category: "armor" as const,
    grade: resolveDisplayItemGrade(a.baseItemId, a.baseItem.grade),
  };
}

function applyKindToPayload(
  kind: OptionConsumableKind,
  payload: ReturnType<typeof parseEquipmentOptionsPayload>,
  category: EquipCategory,
  itemGrade: number,
): ReturnType<typeof parseEquipmentOptionsPayload> {
  switch (kind) {
    case "appraisal": {
      const next = appraisePayload(payload);
      if (!next) throw new Error("ALREADY_IDENTIFIED");
      return next;
    }
    case "destruction": {
      if (!payload.identified) throw new Error("NEEDS_APPRAISAL");
      if (payload.options.length === 0) throw new Error("NO_OPTIONS");
      const next = removeRandomUnlockedOption(payload);
      if (!next) throw new Error("NO_REMOVABLE_OPTION");
      return next;
    }
    case "chaos": {
      if (!payload.identified) throw new Error("NEEDS_APPRAISAL");
      if (payload.options.length === 0) throw new Error("NO_OPTIONS");
      return rerollOptionIdsKeepingTiersInPayload(payload, category, itemGrade);
    }
    case "seal": {
      if (!payload.identified) throw new Error("NEEDS_APPRAISAL");
      if (payload.options.length === 0) throw new Error("NO_OPTIONS");
      const next = sealRandomUnlockedSlot(payload);
      if (!next) throw new Error("SEAL_LIMIT_OR_NO_SLOT");
      return next;
    }
  }
}

export async function applyEquipmentConsumable(
  input: ApplyEquipmentConsumableInput,
): Promise<ApplyEquipmentConsumableResult> {
  const consumableId = normalizeItemIdLower(input.consumableItemId);
  const kind = optionConsumableKind(consumableId);
  if (!kind) throw new Error("NOT_OPTION_CONSUMABLE");

  const targetKind = input.targetKind;
  const targetId = input.targetInstanceId.trim();
  if (!targetId) throw new Error("BAD_REQUEST");

  return runPrismaTransaction(async (tx) => {
    const stack = await tx.inventoryStack.findUnique({
      where: { userId_itemId: { userId: input.userId, itemId: consumableId } },
    });
    if (!stack || stack.quantity < 1) throw new Error("NO_CONSUMABLE");

    const target = await loadTarget(tx, input.userId, targetKind, targetId);
    const equipCat = equipmentCategory(target.row.baseItemId, target.row.baseItem.category);
    if (equipCat !== targetKind) throw new Error("KIND_MISMATCH");

    const payload = parseEquipmentOptionsPayload(target.row.optionsJson);
    const nextPayload = applyKindToPayload(kind, payload, target.category, target.grade);
    const optionsJson = serializeEquipmentOptionsPayload(nextPayload);

    if (target.kind === "weapon") {
      await tx.weaponInstance.update({
        where: { id: targetId },
        data: { optionsJson },
      });
    } else {
      await tx.armorInstance.update({
        where: { id: targetId },
        data: { optionsJson },
      });
    }

    if (stack.quantity <= 1) {
      await tx.inventoryStack.delete({
        where: { userId_itemId: { userId: input.userId, itemId: consumableId } },
      });
    } else {
      await tx.inventoryStack.update({
        where: { userId_itemId: { userId: input.userId, itemId: consumableId } },
        data: { quantity: { decrement: 1 } },
      });
    }

    return {
      ok: true as const,
      kind,
      targetKind,
      targetInstanceId: targetId,
      optionsJson,
      options: formatEquipmentOptionDisplay(optionsJson, target.category),
      identified: nextPayload.identified,
      lockedIndices: nextPayload.lockedIndices,
    };
  });
}

export type AppraiseAllUnidentifiedResult = {
  ok: true;
  appraisedCount: number;
  scrollsUsed: number;
  weaponInstanceIds: string[];
  armorInstanceIds: string[];
};

/** 미감정·보유(OWNED) 무기·방어구 일괄 감정 — 감정 주문서 1장/1개 */
export async function appraiseAllUnidentifiedEquipment(userId: string): Promise<AppraiseAllUnidentifiedResult> {
  const consumableId = ITEM_APPRAISAL_SCROLL;

  return runPrismaTransaction(async (tx) => {
    const weapons = await tx.weaponInstance.findMany({
      where: { userId, status: "OWNED" },
      select: { id: true, optionsJson: true },
    });
    const armors = await tx.armorInstance.findMany({
      where: { userId, status: "OWNED" },
      select: { id: true, optionsJson: true },
    });

    const targets: Array<{ kind: EquipCategory; id: string; payload: ReturnType<typeof parseEquipmentOptionsPayload> }> =
      [];

    for (const w of weapons) {
      const payload = parseEquipmentOptionsPayload(w.optionsJson);
      if (payload.identified) continue;
      targets.push({ kind: "weapon", id: w.id, payload });
    }
    for (const a of armors) {
      const payload = parseEquipmentOptionsPayload(a.optionsJson);
      if (payload.identified) continue;
      targets.push({ kind: "armor", id: a.id, payload });
    }

    if (targets.length === 0) throw new Error("NOTHING_TO_APPRAISE");

    const stack = await tx.inventoryStack.findUnique({
      where: { userId_itemId: { userId, itemId: consumableId } },
    });
    if (!stack || stack.quantity < targets.length) throw new Error("INSUFFICIENT_SCROLLS");

    const weaponInstanceIds: string[] = [];
    const armorInstanceIds: string[] = [];

    for (const t of targets) {
      const nextPayload = appraisePayload(t.payload);
      if (!nextPayload) continue;
      const optionsJson = serializeEquipmentOptionsPayload(nextPayload);
      if (t.kind === "weapon") {
        await tx.weaponInstance.update({ where: { id: t.id }, data: { optionsJson } });
        weaponInstanceIds.push(t.id);
      } else {
        await tx.armorInstance.update({ where: { id: t.id }, data: { optionsJson } });
        armorInstanceIds.push(t.id);
      }
    }

    const used = weaponInstanceIds.length + armorInstanceIds.length;
    if (used === 0) throw new Error("NOTHING_TO_APPRAISE");

    if (stack.quantity <= used) {
      await tx.inventoryStack.delete({
        where: { userId_itemId: { userId, itemId: consumableId } },
      });
    } else {
      await tx.inventoryStack.update({
        where: { userId_itemId: { userId, itemId: consumableId } },
        data: { quantity: { decrement: used } },
      });
    }

    return {
      ok: true as const,
      appraisedCount: used,
      scrollsUsed: used,
      weaponInstanceIds,
      armorInstanceIds,
    };
  });
}
