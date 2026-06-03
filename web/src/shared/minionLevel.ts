import type { MinionStatKey } from "@/shared/minionBaseStats";

/**
 * 던전 전투 미니언(DUNGEON pool) 전용 레벨·스탯 규칙.
 * 수집 일꾼(GATHER)은 레벨/EXP 없음.
 */
export const MINION_LEVEL_RULES = {
  maxLevel: 200,
  statPointsPerLevel: 3,
  maxStatPerAttribute: 150,
} as const;

export function xpRequiredForNextLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return 50 + lv * 25;
}

export function isMinionMaxLevel(level: number): boolean {
  return Math.max(1, Math.floor(level)) >= MINION_LEVEL_RULES.maxLevel;
}

export type MinionLevelProgress = {
  level: number;
  experience: number;
  xpToNext: number;
  xpProgress: number;
  unspentStatPoints: number;
  isMaxLevel: boolean;
};

export function minionLevelProgress(input: {
  level: number;
  experience: number;
  unspentStatPoints: number;
}): MinionLevelProgress {
  const level = Math.max(1, Math.floor(input.level));
  const experience = Math.max(0, Math.floor(input.experience));
  const unspentStatPoints = Math.max(0, Math.floor(input.unspentStatPoints));
  const isMaxLevel = isMinionMaxLevel(level);
  const xpToNext = isMaxLevel ? 0 : xpRequiredForNextLevel(level);
  const xpProgress = isMaxLevel || xpToNext <= 0 ? 1 : Math.min(1, experience / xpToNext);
  return { level, experience, xpToNext, xpProgress, unspentStatPoints, isMaxLevel };
}

export type MinionStatAllocation = Partial<Record<MinionStatKey, number>>;

export function sumStatAllocation(alloc: MinionStatAllocation): number {
  let sum = 0;
  for (const v of Object.values(alloc)) {
    if (typeof v === "number" && v > 0) sum += Math.floor(v);
  }
  return sum;
}

export function cumulativeXpToLevel(targetLevel: number): number {
  const target = Math.max(1, Math.floor(targetLevel));
  let sum = 0;
  for (let lv = 1; lv < target; lv++) sum += xpRequiredForNextLevel(lv);
  return sum;
}

export function totalStatPointsByMaxLevel(maxLevel = MINION_LEVEL_RULES.maxLevel): number {
  return Math.max(0, maxLevel - 1) * MINION_LEVEL_RULES.statPointsPerLevel;
}
