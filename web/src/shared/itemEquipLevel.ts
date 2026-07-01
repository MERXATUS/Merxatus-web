import { clampItemGrade, type ItemGradeIndex } from "@/server/itemGrade";
import { getArmorStats } from "@/shared/armorStatsData";
import { normalizeItemLevel } from "@/shared/equipmentItemLevel";
import { normalizeItemIdLower } from "@/shared/itemId";
import { getWeaponStats } from "@/shared/weaponStatsData";

import { displayCombatPower } from "@/shared/combatPowerScale";

/** 등급별 미니언 최소 착용 전투력 (표시 CP 척도) */
export const EQUIP_MIN_COMBAT_POWER_BY_GRADE: Record<ItemGradeIndex, number> = {
  1: 0,
  2: displayCombatPower(15),
  3: displayCombatPower(40),
  4: displayCombatPower(65),
  5: displayCombatPower(90),
  6: displayCombatPower(115),
  7: displayCombatPower(145),
  8: displayCombatPower(175),
};

/** @deprecated 레벨 게이트 → 전투력으로 대체 */
export const EQUIP_MIN_LEVEL_BY_GRADE = EQUIP_MIN_COMBAT_POWER_BY_GRADE;

export function minEquipCombatPowerForGrade(grade: number): number {
  return EQUIP_MIN_COMBAT_POWER_BY_GRADE[clampItemGrade(grade)];
}

/** @deprecated */
export function minEquipLevelForGrade(grade: number): number {
  return minEquipCombatPowerForGrade(grade);
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

export function minEquipCombatPowerForItem(baseItemId: string, gradeOverride?: number | null): number {
  return minEquipCombatPowerForGrade(itemGradeForEquipCheck(baseItemId, gradeOverride));
}

/** @deprecated */
export function minEquipLevelForItem(baseItemId: string, gradeOverride?: number | null): number {
  return minEquipCombatPowerForItem(baseItemId, gradeOverride);
}

/** 인스턴스 아이템 레벨과 등급 요구 중 높은 값 */
export function requiredEquipCombatPowerForInstance(
  baseItemId: string,
  gradeOverride?: number | null,
  instanceItemLevel?: number | null,
): number {
  const gradeReq = minEquipCombatPowerForItem(baseItemId, gradeOverride);
  const il = normalizeItemLevel(instanceItemLevel ?? 10);
  const ilReq = displayCombatPower(Math.max(0, il - 10));
  return Math.max(gradeReq, ilReq);
}

export function canMinionEquipItemByCombatPower(
  minionCombatPower: number,
  baseItemId: string,
  gradeOverride?: number | null,
  instanceItemLevel?: number | null,
): boolean {
  const cp = Math.max(0, Math.floor(minionCombatPower));
  return cp >= requiredEquipCombatPowerForInstance(baseItemId, gradeOverride, instanceItemLevel);
}

/** @deprecated — `canMinionEquipItemByCombatPower` */
export function canMinionEquipItemByLevel(
  minionLevel: number,
  baseItemId: string,
  gradeOverride?: number | null,
  instanceItemLevel?: number | null,
): boolean {
  return canMinionEquipItemByCombatPower(minionLevel, baseItemId, gradeOverride, instanceItemLevel);
}

export function equipCombatPowerRequirementLabel(
  baseItemId: string,
  gradeOverride?: number | null,
  instanceItemLevel?: number | null,
): string | null {
  const req = requiredEquipCombatPowerForInstance(baseItemId, gradeOverride, instanceItemLevel);
  if (req <= 0) return null;
  return `착용 전투력 ${req.toLocaleString()}+`;
}

/** @deprecated */
export function equipLevelRequirementLabel(
  baseItemId: string,
  gradeOverride?: number | null,
  instanceItemLevel?: number | null,
): string | null {
  return equipCombatPowerRequirementLabel(baseItemId, gradeOverride, instanceItemLevel);
}

/** 서버·API — 미충족 시 `MINION_COMBAT_POWER_TOO_LOW:{required}` */
export function assertMinionMeetsEquipCombatPower(
  minionCombatPower: number,
  baseItemId: string,
  gradeOverride?: number | null,
  instanceItemLevel?: number | null,
): void {
  const required = requiredEquipCombatPowerForInstance(baseItemId, gradeOverride, instanceItemLevel);
  const cp = Math.max(0, Math.floor(minionCombatPower));
  if (cp < required) {
    throw new Error(`MINION_COMBAT_POWER_TOO_LOW:${required}`);
  }
}

/** @deprecated */
export function assertMinionMeetsEquipLevel(
  minionLevel: number,
  baseItemId: string,
  gradeOverride?: number | null,
  instanceItemLevel?: number | null,
): void {
  assertMinionMeetsEquipCombatPower(minionLevel, baseItemId, gradeOverride, instanceItemLevel);
}

export function parseMinionLevelTooLowError(code: string): number | null {
  const m = /^(?:MINION_LEVEL_TOO_LOW|MINION_COMBAT_POWER_TOO_LOW):(\d+)$/.exec(code.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** @deprecated — `requiredEquipCombatPowerForInstance` */
export const requiredEquipLevelForInstance = requiredEquipCombatPowerForInstance;
