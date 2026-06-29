import { clampItemGrade, type ItemGradeIndex } from "@/server/itemGrade";
import { getArmorStats } from "@/shared/armorStatsData";
import { normalizeItemLevel } from "@/shared/equipmentItemLevel";
import { normalizeItemIdLower } from "@/shared/itemId";
import { getWeaponStats } from "@/shared/weaponStatsData";

/** 등급별 미니언 최소 착용 레벨 */
export const EQUIP_MIN_LEVEL_BY_GRADE: Record<ItemGradeIndex, number> = {
  1: 1,
  2: 15,
  3: 35,
  4: 55,
  5: 75,
  6: 95,
  7: 120,
  8: 150,
};

export function minEquipLevelForGrade(grade: number): number {
  return EQUIP_MIN_LEVEL_BY_GRADE[clampItemGrade(grade)];
}

export function itemGradeForEquipCheck(baseItemId: string, gradeOverride?: number | null): number {
  if (gradeOverride != null && Number.isFinite(gradeOverride)) {
    return clampItemGrade(gradeOverride);
  }
  const id = normalizeItemIdLower(baseItemId);
  const weapon = getWeaponStats(id);
  if (weapon) return clampItemGrade(weapon.grade);
  const armor = getArmorStats(id);
  if (armor) return clampItemGrade(armor.grade);
  return 1;
}

export function minEquipLevelForItem(baseItemId: string, gradeOverride?: number | null): number {
  return minEquipLevelForGrade(itemGradeForEquipCheck(baseItemId, gradeOverride));
}

/** 인스턴스 아이템 레벨과 등급 요구 중 높은 값 */
export function requiredEquipLevelForInstance(
  baseItemId: string,
  gradeOverride?: number | null,
  instanceItemLevel?: number | null,
): number {
  const gradeReq = minEquipLevelForItem(baseItemId, gradeOverride);
  const il = normalizeItemLevel(instanceItemLevel ?? gradeReq);
  return Math.max(gradeReq, il);
}

export function canMinionEquipItemByLevel(
  minionLevel: number,
  baseItemId: string,
  gradeOverride?: number | null,
  instanceItemLevel?: number | null,
): boolean {
  const lv = Math.max(1, Math.floor(minionLevel));
  return lv >= requiredEquipLevelForInstance(baseItemId, gradeOverride, instanceItemLevel);
}

export function equipLevelRequirementLabel(
  baseItemId: string,
  gradeOverride?: number | null,
  instanceItemLevel?: number | null,
): string | null {
  const req = requiredEquipLevelForInstance(baseItemId, gradeOverride, instanceItemLevel);
  if (req <= 1) return null;
  return `착용 Lv${req}+`;
}

/** 서버·API — 미충족 시 `MINION_LEVEL_TOO_LOW:{required}` */
export function assertMinionMeetsEquipLevel(
  minionLevel: number,
  baseItemId: string,
  gradeOverride?: number | null,
  instanceItemLevel?: number | null,
): void {
  const required = requiredEquipLevelForInstance(baseItemId, gradeOverride, instanceItemLevel);
  const lv = Math.max(1, Math.floor(minionLevel));
  if (lv < required) {
    throw new Error(`MINION_LEVEL_TOO_LOW:${required}`);
  }
}

export function parseMinionLevelTooLowError(code: string): number | null {
  const m = /^MINION_LEVEL_TOO_LOW:(\d+)$/.exec(code.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
