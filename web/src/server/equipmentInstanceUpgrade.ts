import type { Prisma } from "@prisma/client";
import { resolveDisplayItemGrade } from "@/server/itemGrade";
import {
  ENHANCE_MANA_STONE_ITEM_IDS,
  computeEnhanceSuccessRate,
  isEnhanceManaStoneItemId,
  resolveWeaponUpgradeDeductions,
  rollWeaponEnhanceSuccess,
  weaponEnhanceMaxLevelForWeapon,
  weaponUpgradeCostForNextLevel,
} from "@/server/weaponUpgradeRules";
import { assertEquipmentNotUserLocked } from "@/server/inventoryEquipmentLock";
import { stackAvailableQty, takeAvailableFromStack } from "@/server/inventoryStackOps";
import { ITEM_ENHANCE_SCROLL_PROTECT, ITEM_GEM_BLESSING, BLESSING_GEM_SUCCESS_LEVEL_GAIN } from "@/shared/enhanceConsumables";

type UpgradeTx = Prisma.TransactionClient;
type EquipKind = "weapon" | "armor";

export type EquipmentUpgradeAttemptResult = {
  ok: true;
  kind: EquipKind;
  instanceId: string;
  success: boolean;
  from: number;
  to: number;
  successRate: number;
  usedProtectionScroll: boolean;
  usedBlessingGem: boolean;
  protectedOnFail: boolean;
  cost: ReturnType<typeof weaponUpgradeCostForNextLevel>;
};

async function loadOwnedEquipment(
  tx: UpgradeTx,
  userId: string,
  kind: EquipKind,
  instanceId: string,
) {
  if (kind === "weapon") {
    const inst = await tx.weaponInstance.findUnique({
      where: { id: instanceId },
      include: { baseItem: true, listing: { select: { id: true } } },
    });
    if (!inst) throw new Error("WEAPON_INSTANCE_NOT_FOUND");
    if (inst.userId !== userId) throw new Error("FORBIDDEN");
    if (inst.baseItem.category !== "무기") throw new Error("NOT_A_WEAPON");
    if (inst.status !== "OWNED" || inst.listing) throw new Error("WEAPON_LOCKED");
    assertEquipmentNotUserLocked(inst);
    return { kind: "weapon" as const, inst };
  }
  const inst = await tx.armorInstance.findUnique({
    where: { id: instanceId },
    include: { baseItem: true },
  });
  if (!inst) throw new Error("ARMOR_INSTANCE_NOT_FOUND");
  if (inst.userId !== userId) throw new Error("FORBIDDEN");
  if (inst.baseItem.category !== "방어구") throw new Error("NOT_ARMOR");
  if (inst.status !== "OWNED") throw new Error("EQUIPMENT_LOCKED");
  assertEquipmentNotUserLocked(inst);
  return { kind: "armor" as const, inst };
}

async function refundStacks(
  tx: UpgradeTx,
  userId: string,
  rows: Array<{ itemId: string; quantity: number }>,
  goldRefund: number,
) {
  if (goldRefund > 0) {
    await tx.wallet.update({
      where: { userId },
      data: { goldAvailable: { increment: goldRefund } },
    });
  }
  for (const m of rows) {
    await tx.inventoryStack.upsert({
      where: { userId_itemId: { userId, itemId: m.itemId } },
      create: { userId, itemId: m.itemId, quantity: m.quantity },
      update: { quantity: { increment: m.quantity } },
    });
  }
}

export async function attemptEquipmentInstanceUpgrade(
  tx: UpgradeTx,
  input: {
    userId: string;
    kind: EquipKind;
    instanceId: string;
    useProtectionScroll?: boolean;
    useBlessingGem?: boolean;
    manaStoneItemId?: string | null;
  },
): Promise<EquipmentUpgradeAttemptResult> {
  const loaded = await loadOwnedEquipment(tx, input.userId, input.kind, input.instanceId);
  const inst = loaded.inst;
  const cur = Math.max(0, Math.floor(inst.enhanceLevel ?? 0));
  const max = weaponEnhanceMaxLevelForWeapon(
    resolveDisplayItemGrade(inst.baseItemId, inst.baseItem.grade),
  );
  if (cur >= max) throw new Error("MAX_WEAPON_LEVEL");

  const cost = weaponUpgradeCostForNextLevel(cur);
  const useProtect = !!input.useProtectionScroll;
  const useBlessing = !!input.useBlessingGem;

  const wallet = await tx.wallet.findUnique({ where: { userId: input.userId } });
  if (!wallet) throw new Error("WALLET_NOT_FOUND");
  if (wallet.goldAvailable < cost.gold) throw new Error("INSUFFICIENT_GOLD");

  const materialIds = [
    ...new Set([
      ...cost.materials.map((m) => m.itemId),
      ...ENHANCE_MANA_STONE_ITEM_IDS,
      ...(useProtect ? [ITEM_ENHANCE_SCROLL_PROTECT] : []),
      ...(useBlessing ? [ITEM_GEM_BLESSING] : []),
    ]),
  ];
  const stacks =
    materialIds.length > 0
      ? await tx.inventoryStack.findMany({
          where: { userId: input.userId, itemId: { in: materialIds } },
        })
      : [];
  const stackById = new Map(stacks.map((s) => [s.itemId, stackAvailableQty(s)]));
  const stackQty = (itemId: string) => stackById.get(itemId) ?? 0;

  if (useProtect && stackQty(ITEM_ENHANCE_SCROLL_PROTECT) < 1) {
    throw new Error(`INSUFFICIENT_MATERIAL:${ITEM_ENHANCE_SCROLL_PROTECT}`);
  }
  if (useBlessing && stackQty(ITEM_GEM_BLESSING) < 1) {
    throw new Error(`INSUFFICIENT_MATERIAL:${ITEM_GEM_BLESSING}`);
  }

  const optionalManaId = input.manaStoneItemId?.trim().toLowerCase() ?? "";
  if (optionalManaId) {
    if (!isEnhanceManaStoneItemId(optionalManaId)) throw new Error("INVALID_MANA_STONE_CHOICE");
    if (stackQty(optionalManaId) < 1) throw new Error(`INSUFFICIENT_MATERIAL:${optionalManaId}`);
  }

  const deductions = resolveWeaponUpgradeDeductions(cost.materials, stackQty);
  if (!deductions && cost.materials.length > 0) {
    const missing = cost.materials.find((m) => stackQty(m.itemId) < m.quantity);
    throw new Error(`INSUFFICIENT_MATERIAL:${missing?.itemId ?? cost.materials[0]?.itemId ?? "unknown"}`);
  }

  const materialDeductions = [
    ...(deductions ?? []),
    ...(optionalManaId ? [{ itemId: optionalManaId, quantity: 1 }] : []),
  ];

  const allDeductions = [
    ...materialDeductions,
    ...(useProtect ? [{ itemId: ITEM_ENHANCE_SCROLL_PROTECT, quantity: 1 }] : []),
    ...(useBlessing ? [{ itemId: ITEM_GEM_BLESSING, quantity: 1 }] : []),
  ];

  await tx.wallet.update({
    where: { userId: input.userId },
    data: { goldAvailable: { decrement: cost.gold } },
  });
  for (const m of allDeductions) {
    await takeAvailableFromStack(tx, input.userId, m.itemId, m.quantity);
  }

  const effectiveSuccessRate = computeEnhanceSuccessRate({
    baseSuccessRate: cost.successRate,
    manaStoneItemId: optionalManaId || null,
    useBlessingGem: useBlessing,
  });
  const success = rollWeaponEnhanceSuccess(effectiveSuccessRate);
  const levelGain = success && useBlessing ? BLESSING_GEM_SUCCESS_LEVEL_GAIN : 1;
  const nextLevel = success ? Math.min(max, cur + levelGain) : cur;
  let protectedOnFail = false;

  if (!success && useProtect) {
    await refundStacks(tx, input.userId, materialDeductions, cost.gold);
    protectedOnFail = true;
  }

  if (input.kind === "weapon") {
    const updated = await tx.weaponInstance.update({
      where: { id: inst.id },
      data: { enhanceLevel: nextLevel },
    });
    return {
      ok: true,
      kind: "weapon",
      instanceId: updated.id,
      success,
      from: cur,
      to: updated.enhanceLevel,
      successRate: effectiveSuccessRate,
      usedProtectionScroll: useProtect,
      usedBlessingGem: useBlessing,
      protectedOnFail,
      cost,
    };
  }

  const updated = await tx.armorInstance.update({
    where: { id: inst.id },
    data: { enhanceLevel: nextLevel },
  });
  return {
    ok: true,
    kind: "armor",
    instanceId: updated.id,
    success,
    from: cur,
    to: updated.enhanceLevel,
    successRate: effectiveSuccessRate,
    usedProtectionScroll: useProtect,
    usedBlessingGem: useBlessing,
    protectedOnFail,
    cost,
  };
}
