/** 아이템 등급 1=일반 … 8=초월 (`server/itemGrade` ITEM_GRADE_LABELS와 동기) */
export type ItemGradeIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

function clampItemGrade(g: number): ItemGradeIndex {
  const n = Math.floor(Number(g));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(8, n)) as ItemGradeIndex;
}

/** 등급별 옵션 티어 상한 — 등급 3+ 드랍 체감 +1 (cap 9) */
export const OPTION_TIER_MAX_LOOT: Record<ItemGradeIndex, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 5,
  5: 6,
  6: 7,
  7: 8,
  8: 9,
};

/** 제작·감정 재추첨 등 — 드랍보다 +1틱까지 허용 */
export const OPTION_TIER_MAX_CRAFT: Record<ItemGradeIndex, number> = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 7,
  7: 8,
  8: 9,
};

/** 이 등급 미만 아이템 옵션 풀에서 제외 */
const WEAPON_OPTION_MIN_GRADE: Record<string, number> = {
  CRIT_DMG_PCT: 2,
  ARMOR_PEN_PCT: 2,
  LIFE_STEAL_PCT: 2,
  FINAL_DMG_PCT: 3,
  ITEM_RARITY_PCT: 3,
  DMG_VS_BOSS_PCT: 4,
  DMG_VS_ANGEL_PCT: 4,
  DMG_VS_DEMON_PCT: 4,
};

const ARMOR_OPTION_MIN_GRADE: Record<string, number> = {
  HP_PCT: 2,
  DEF_PCT: 2,
  DMG_RED_PCT: 3,
  BLOCK_PCT: 3,
  CRIT_RESIST_PCT: 3,
  EVASION_PCT: 3,
  REGEN_HP_ADD: 2,
  THORN_PCT: 4,
  LIFE_STEAL_PCT: 4,
  FINAL_DMG_PCT: 5,
};

export type OptionTierRollMode = "loot" | "craft";

function pickWeightedIndex(weights: number[], rnd: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

export function maxOptionTierForGrade(grade: number, mode: OptionTierRollMode): number {
  const g = clampItemGrade(grade);
  const table = mode === "loot" ? OPTION_TIER_MAX_LOOT : OPTION_TIER_MAX_CRAFT;
  return table[g];
}

/** 가중치 롤 구간 — 상한의 65~100% 구간을 피크로 bell */
function tierBandForGrade(grade: number, mode: OptionTierRollMode): { min: number; max: number; peak: number } {
  const g = clampItemGrade(grade);
  const max = maxOptionTierForGrade(g, mode);
  const min = Math.max(1, max <= 2 ? 1 : max - 2);
  const peak = Math.min(max, Math.max(min, Math.floor(min + (max - min) * 0.55)));
  return { min, max, peak };
}

export function rollOptionTierForGrade(
  grade: number,
  mode: OptionTierRollMode,
  rnd: () => number,
): number {
  const { min, max, peak } = tierBandForGrade(grade, mode);
  const weights: number[] = [];
  for (let t = min; t <= max; t++) {
    weights.push(Math.max(0.12, 1.2 - Math.abs(t - peak) * 0.38));
  }
  return min + pickWeightedIndex(weights, rnd);
}

export function clampOptionTierToGrade(tier: number, grade: number, mode: OptionTierRollMode): number {
  const max = maxOptionTierForGrade(grade, mode);
  return Math.max(1, Math.min(max, Math.floor(tier)));
}

export function minItemGradeForOptionId(optionId: string, pool: "weapon" | "armor"): number {
  const map = pool === "armor" ? ARMOR_OPTION_MIN_GRADE : WEAPON_OPTION_MIN_GRADE;
  return map[optionId] ?? 1;
}

export function filterOptionIdsForGrade(optionIds: string[], grade: number, pool: "weapon" | "armor"): string[] {
  const g = clampItemGrade(grade);
  const eligible = optionIds.filter((id) => minItemGradeForOptionId(id, pool) <= g);
  return eligible.length > 0 ? eligible : optionIds;
}

/** 등급에서 실제 추첨 가능한 옵션 ID 수 */
export function countEligibleOptionsForGrade(
  optionIds: string[],
  grade: number,
  pool: "weapon" | "armor",
): number {
  return filterOptionIdsForGrade(optionIds, grade, pool).length;
}
