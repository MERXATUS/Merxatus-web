import {
  assertMinionMeetsEquipCombatPower,
  canMinionEquipItemByCombatPower,
  minEquipCombatPowerForItem,
} from "@/shared/itemEquipLevel";

export {
  assertMinionMeetsEquipCombatPower,
  assertMinionMeetsEquipLevel,
  canMinionEquipItemByCombatPower,
  canMinionEquipItemByLevel,
  minEquipCombatPowerForItem,
  minEquipLevelForItem,
} from "@/shared/itemEquipLevel";

export function assertMinionCanEquipBaseItem(input: {
  minionCombatPower: number;
  baseItemId: string;
  itemGrade?: number | null;
  instanceItemLevel?: number | null;
}): void {
  assertMinionMeetsEquipCombatPower(
    input.minionCombatPower,
    input.baseItemId,
    input.itemGrade ?? null,
    input.instanceItemLevel ?? null,
  );
}
