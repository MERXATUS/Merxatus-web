/** 무기 베이스 전투력 — `server/gameRules.ts` combat.weaponPowerByItemId 와 동기 */
export const WEAPON_BASE_POWER_BY_ITEM_ID: Record<string, number> = {
  weapon_wood_sword: 1,
  weapon_stone_sword: 2,
  weapon_red_gold_sword: 3,
  weapon_steel_sword: 4,
  weapon_gold_sword: 5,
  weapon_diamond_sword: 7,
};

/** 강화 1단계당 추가 전투력 */
export const WEAPON_LEVEL_POWER_PER_LEVEL = 1;
