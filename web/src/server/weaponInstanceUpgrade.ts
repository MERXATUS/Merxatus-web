import type { Prisma } from "@prisma/client";
import {
  ENHANCE_SCROLL_ITEM_IDS,
  enhanceScrollQtyAtOrAboveTier,
  resolveWeaponUpgradeDeductions,
  rollWeaponEnhanceSuccess,
  weaponEnhanceMaxLevelForWeapon,
  weaponUpgradeCostForNextLevel,
} from "@/server/weaponUpgradeRules";

type UpgradeTx = Prisma.TransactionClient;

export type WeaponUpgradeAttemptResult = {
  ok: true;
  weaponInstanceId: string;
  success: boolean;
  from: number;
  to: number;
  successRate: number;
  cost: ReturnType<typeof weaponUpgradeCostForNextLevel>;
};

/** 골드·재료 차감 후 성공률 판정 — 실패해도 비용은 소모 */
export async function attemptWeaponInstanceUpgrade(
  tx: UpgradeTx,
  input: { userId: string; weaponInstanceId: string },
): Promise<WeaponUpgradeAttemptResult> {
  const inst = await tx.weaponInstance.findUnique({
    where: { id: input.weaponInstanceId },
    include: { baseItem: true },
  });
  if (!inst) throw new Error("WEAPON_INSTANCE_NOT_FOUND");
  if (inst.userId !== input.userId) throw new Error("FORBIDDEN");
  if (inst.baseItem.category !== "무기") throw new Error("NOT_A_WEAPON");
  if (inst.status !== "OWNED") throw new Error("WEAPON_LOCKED");

  const cur = Math.max(0, Math.floor(inst.enhanceLevel ?? 0));
  const max = weaponEnhanceMaxLevelForWeapon(inst.baseItem.grade);
  if (cur >= max) throw new Error("MAX_WEAPON_LEVEL");

  const cost = weaponUpgradeCostForNextLevel(cur);

  const wallet = await tx.wallet.findUnique({ where: { userId: input.userId } });
  if (!wallet) throw new Error("WALLET_NOT_FOUND");
  if (wallet.goldAvailable < cost.gold) throw new Error("INSUFFICIENT_GOLD");

  const needsScroll = cost.materials.some((m) => ENHANCE_SCROLL_ITEM_IDS.includes(m.itemId as (typeof ENHANCE_SCROLL_ITEM_IDS)[number]));
  const materialIds = [
    ...new Set([
      ...cost.materials.map((m) => m.itemId),
      ...(needsScroll ? ENHANCE_SCROLL_ITEM_IDS : []),
    ]),
  ];
  const stacks =
    materialIds.length > 0
      ? await tx.inventoryStack.findMany({
          where: { userId: input.userId, itemId: { in: materialIds } },
        })
      : [];
  const stackById = new Map(stacks.map((s) => [s.itemId, s.quantity]));
  const stackQty = (itemId: string) => stackById.get(itemId) ?? 0;

  const deductions = resolveWeaponUpgradeDeductions(cost.materials, stackQty);
  if (!deductions) {
    const missing = cost.materials.find((m) => enhanceScrollQtyAtOrAboveTier(m.itemId, stackQty) < m.quantity);
    throw new Error(`INSUFFICIENT_MATERIAL:${missing?.itemId ?? cost.materials[0]?.itemId ?? "unknown"}`);
  }

  await tx.wallet.update({
    where: { userId: input.userId },
    data: { goldAvailable: { decrement: cost.gold } },
  });
  for (const m of deductions) {
    await tx.inventoryStack.update({
      where: { userId_itemId: { userId: input.userId, itemId: m.itemId } },
      data: { quantity: { decrement: m.quantity } },
    });
  }

  const success = rollWeaponEnhanceSuccess(cost.successRate);
  const nextLevel = success ? cur + 1 : cur;
  const updated = await tx.weaponInstance.update({
    where: { id: inst.id },
    data: { enhanceLevel: nextLevel },
  });

  return {
    ok: true,
    weaponInstanceId: updated.id,
    success,
    from: cur,
    to: updated.enhanceLevel,
    successRate: cost.successRate,
    cost,
  };
}
