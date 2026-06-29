import { assertMinionMeetsEquipLevel } from "@/shared/itemEquipLevel";

export { assertMinionMeetsEquipLevel, canMinionEquipItemByLevel, minEquipLevelForItem } from "@/shared/itemEquipLevel";

export function assertMinionCanEquipBaseItem(input: {
  minionLevel: number;
  baseItemId: string;
  itemGrade?: number | null;
  instanceItemLevel?: number | null;
}): void {
  assertMinionMeetsEquipLevel(
    input.minionLevel,
    input.baseItemId,
    input.itemGrade ?? null,
    input.instanceItemLevel ?? null,
  );
}
