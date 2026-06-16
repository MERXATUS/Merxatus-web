import type { MinionStatKey } from "@/shared/minionBaseStats";

const MINION_MAX_LEVEL = 200;
const MINION_STAT_POINTS_PER_LEVEL = 3;

/**
 * 던전 전투 미니언(DUNGEON pool) 전용 레벨·스탯 규칙.
 * 수집 일꾼(GATHER)은 레벨/EXP 없음.
 */
export const MINION_LEVEL_RULES = {
  maxLevel: MINION_MAX_LEVEL,
  statPointsPerLevel: MINION_STAT_POINTS_PER_LEVEL,
  /** 단일 스탯 상한 — 만렙까지 획득 포인트 전부 몰빌 가능 (과거 150은 Lv51대 조기 상한) */
  maxStatPerAttribute: (MINION_MAX_LEVEL - 1) * MINION_STAT_POINTS_PER_LEVEL,
} as const;

/** 이 레벨까지 빠른 성장 구간 (2차 전직 Lv70까지 약 30~60분 목표) */
export const MINION_EARLY_FAST_LEVEL = 70;

/**
 * 다음 레벨 필요 EXP.
 * - Lv1~69: Lv70·2차 전직까지 약 30~60분 (던전 스테이지 1~3 + EXP 배율과 맞춤)
 * - Lv70+: 후반만 가파르게
 */
export function xpRequiredForNextLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  if (lv < 30) {
    return Math.max(10, Math.floor(10 + lv * 7));
  }
  if (lv < MINION_EARLY_FAST_LEVEL) {
    return Math.max(6, Math.floor(4 + lv * 2));
  }
  const late = lv - MINION_EARLY_FAST_LEVEL;
  return Math.floor(95 + late * 34 + late * late * 0.12);
}

/** Lv70 미만 전투 EXP 배율 — `MINION_EARLY_FAST_LEVEL` 여정 가속 */
export const MINION_EARLY_XP_GRANT_MULT = 1.35;

export function minionXpGrantMultiplier(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  if (lv < MINION_EARLY_FAST_LEVEL) return MINION_EARLY_XP_GRANT_MULT;
  return 1;
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

/** 레벨로 획득한 총 스탯 포인트 (미배분 + 배분 합) */
export function totalEarnedStatPoints(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return Math.max(0, lv - 1) * MINION_LEVEL_RULES.statPointsPerLevel;
}
