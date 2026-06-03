/** 등급(1=일반 … 8=초월)별 무기 강화 최고 단계 */
export const WEAPON_ENHANCE_MAX_BY_GRADE = [5, 7, 10, 12, 15, 20, 25, 30] as const;

export const WEAPON_ENHANCE_ABSOLUTE_MAX = 30;

export function clampWeaponGrade(grade: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 {
  const n = Math.floor(Number(grade));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(8, n)) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

/** 무기 등급에 따른 강화 상한 (+N) */
export function weaponEnhanceMaxLevelForGrade(grade: number): number {
  return WEAPON_ENHANCE_MAX_BY_GRADE[clampWeaponGrade(grade) - 1];
}
