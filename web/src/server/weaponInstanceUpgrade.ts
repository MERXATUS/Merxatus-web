import type { Prisma } from "@prisma/client";
import { attemptEquipmentInstanceUpgrade } from "@/server/equipmentInstanceUpgrade";

type UpgradeTx = Prisma.TransactionClient;

export type WeaponUpgradeAttemptResult = {
  ok: true;
  weaponInstanceId: string;
  success: boolean;
  from: number;
  to: number;
  successRate: number;
  usedProtectionScroll: boolean;
  protectedOnFail: boolean;
  cost: ReturnType<typeof import("@/server/weaponUpgradeRules").weaponUpgradeCostForNextLevel>;
};

export async function attemptWeaponInstanceUpgrade(
  tx: UpgradeTx,
  input: {
    userId: string;
    weaponInstanceId: string;
    useProtectionScroll?: boolean;
    useBlessingGem?: boolean;
    manaStoneItemId?: string | null;
  },
): Promise<WeaponUpgradeAttemptResult> {
  const r = await attemptEquipmentInstanceUpgrade(tx, {
    userId: input.userId,
    kind: "weapon",
    instanceId: input.weaponInstanceId,
    useProtectionScroll: input.useProtectionScroll,
    useBlessingGem: input.useBlessingGem,
    manaStoneItemId: input.manaStoneItemId,
  });
  return {
    ok: true,
    weaponInstanceId: r.instanceId,
    success: r.success,
    from: r.from,
    to: r.to,
    successRate: r.successRate,
    usedProtectionScroll: r.usedProtectionScroll,
    protectedOnFail: r.protectedOnFail,
    cost: r.cost,
  };
}
