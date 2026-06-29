/** 무기 베이스 전투력 — `server/gameRules.ts` combat.weaponPowerByItemId 와 동기 */
export const WEAPON_BASE_POWER_BY_ITEM_ID: Record<string, number> = {
  weapon_wood_sword: 1,
  weapon_stone_sword: 2,
  weapon_red_gold_sword: 3,
  weapon_steel_sword: 4,
  weapon_gold_sword: 5,
  weapon_diamond_sword: 7,
};

/** 강화 1단계당 베이스 전투력 비율 — `weaponEnhancePowerPerLevel` */
export const WEAPON_ENHANCE_POWER_RATIO = 0.25;

/** @deprecated 고정 +1 — 신규 공식은 `weaponEnhancePowerPerLevel` */
export const WEAPON_LEVEL_POWER_PER_LEVEL = 1;

/** 무기 베이스 전투력 → 강화 1단계당 추가 CP */
export function weaponEnhancePowerPerLevel(basePower: number): number {
  const p = Math.max(0, Math.floor(basePower));
  return Math.max(1, Math.ceil(p * WEAPON_ENHANCE_POWER_RATIO));
}

export function weaponEnhancePowerBonusFromBase(basePower: number, enhanceLevel: number): number {
  const lv = Math.max(0, Math.floor(enhanceLevel));
  if (lv <= 0) return 0;
  return lv * weaponEnhancePowerPerLevel(basePower);
}
