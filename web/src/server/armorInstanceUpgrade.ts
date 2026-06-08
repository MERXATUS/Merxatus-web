import type { Prisma } from "@prisma/client";
import { attemptEquipmentInstanceUpgrade } from "@/server/equipmentInstanceUpgrade";

type UpgradeTx = Prisma.TransactionClient;

export type ArmorUpgradeAttemptResult = {
  ok: true;
  armorInstanceId: string;
  success: boolean;
  from: number;
  to: number;
  successRate: number;
  usedProtectionScroll: boolean;
  protectedOnFail: boolean;
  cost: ReturnType<typeof import("@/server/weaponUpgradeRules").weaponUpgradeCostForNextLevel>;
};

export async function attemptArmorInstanceUpgrade(
  tx: UpgradeTx,
  input: {
    userId: string;
    armorInstanceId: string;
    useProtectionScroll?: boolean;
    manaStoneItemId?: string | null;
  },
): Promise<ArmorUpgradeAttemptResult> {
  const r = await attemptEquipmentInstanceUpgrade(tx, {
    userId: input.userId,
    kind: "armor",
    instanceId: input.armorInstanceId,
    useProtectionScroll: input.useProtectionScroll,
    manaStoneItemId: input.manaStoneItemId,
  });
  return {
    ok: true,
    armorInstanceId: r.instanceId,
    success: r.success,
    from: r.from,
    to: r.to,
    successRate: r.successRate,
    usedProtectionScroll: r.usedProtectionScroll,
    protectedOnFail: r.protectedOnFail,
    cost: r.cost,
  };
}
