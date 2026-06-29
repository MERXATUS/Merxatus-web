import type { DungeonStageDef } from "@/shared/dungeonStageProgression";

/** 입장 최소 파티 평균 레벨 = 권장 하한 × 비율 */
export const DUNGEON_MIN_PARTY_LEVEL_RATIO = 0.85;

/**
 * 스테이지 권장 레벨 구간 기준 참고 파티 전투력 (UI·밸런스 참고용, 입장 제한 없음).
 */
export function recommendedPartyPowerForDungeonStage(
  stage: Pick<DungeonStageDef, "recommendedLevel" | "recommendedLevelMax" | "stageOrder">,
): number {
  const midLevel = Math.floor((stage.recommendedLevel + stage.recommendedLevelMax) / 2);
  const lv = Math.max(1, midLevel);
  const levelPart = 5 + (lv - 1);
  const statPart = Math.floor(lv * 3.2);
  const gearPart = Math.floor(10 + stage.stageOrder * 20 + lv * 0.4);
  return Math.max(1, levelPart + statPart + gearPart);
}

export function minimumPartyLevelForDungeonStage(
  stage: Pick<DungeonStageDef, "recommendedLevel">,
): number {
  return Math.ceil(Math.max(1, stage.recommendedLevel) * DUNGEON_MIN_PARTY_LEVEL_RATIO);
}

export function averagePartyLevel(levels: number[]): number {
  if (!levels.length) return 0;
  const sum = levels.reduce((a, l) => a + Math.max(1, Math.floor(l)), 0);
  return sum / levels.length;
}

export type DungeonPartyEligibility =
  | { ok: true }
  | { ok: false; code: "DUNGEON_PARTY_LEVEL_TOO_LOW"; minLevel: number; partyLevel: number };

/** 던전 입장 — 파티 평균 레벨만 검사 (전투력 제한 없음) */
export function checkDungeonPartyEligibility(input: {
  stage: DungeonStageDef;
  partyLevels: number[];
}): DungeonPartyEligibility {
  const minLevel = minimumPartyLevelForDungeonStage(input.stage);
  const partyLevel = averagePartyLevel(input.partyLevels);
  if (partyLevel < minLevel) {
    return {
      ok: false,
      code: "DUNGEON_PARTY_LEVEL_TOO_LOW",
      minLevel,
      partyLevel: Math.floor(partyLevel * 10) / 10,
    };
  }
  return { ok: true };
}

export type DungeonEnemyCombatMults = {
  hp: number;
  atk: number;
  def: number;
};

function dungeonEnemyCoreMult(input: {
  stageOrder: number;
  floor: number;
  maxFloors: number;
  isBoss: boolean;
}): number {
  const stage = Math.max(1, Math.min(8, Math.floor(input.stageOrder)));
  const maxFloors = Math.max(1, Math.floor(input.maxFloors));
  const floor = Math.max(1, Math.min(maxFloors, Math.floor(input.floor)));

  const stageBase = 0.8 + stage * 0.26;

  const floorProgress = maxFloors <= 1 ? 0 : (floor - 1) / (maxFloors - 1);
  const floorMult = 1 + floorProgress * (input.isBoss ? 0.14 : 0.16);

  const bossMultTable = [1.04, 1.07, 1.14, 1.2, 1.26, 1.36, 1.44, 1.54];
  const bossMult = input.isBoss ? bossMultTable[stage - 1]! : 1;

  return stageBase * floorMult * bossMult;
}

/**
 * 스테이지·층·보스별 던전 적 스탯 배율.
 */
export function dungeonEnemyCombatMults(input: {
  stageOrder: number;
  floor: number;
  maxFloors: number;
  isBoss: boolean;
}): DungeonEnemyCombatMults {
  const stage = Math.max(1, Math.min(8, Math.floor(input.stageOrder)));
  const core = dungeonEnemyCoreMult(input);
  if (input.isBoss) {
    const hpScale =
      stage <= 1 ? 0.74 : stage <= 2 ? 0.76 : stage <= 4 ? 1.22 : stage <= 6 ? 1.38 : stage <= 7 ? 1.5 : 1.62;
    const atkBias =
      (1.0 + stage * 0.028) *
      (stage <= 1 ? 0.5 : stage <= 2 ? 0.42 : stage <= 4 ? 0.98 : stage <= 6 ? 1.12 : 1.22);
    return {
      hp: core * hpScale,
      atk: core * atkBias,
      def: core * 0.86,
    };
  }
  const atkBias = stage <= 2 ? 0.94 + stage * 0.03 : 1.02 + stage * 0.042;
  return {
    hp: core,
    atk: core * atkBias,
    def: core * 0.88,
  };
}

/** @deprecated — `dungeonEnemyCombatMults` 사용 */
export function dungeonEnemyStatMult(input: {
  stageOrder: number;
  floor: number;
  maxFloors: number;
  isBoss: boolean;
}): number {
  return dungeonEnemyCombatMults(input).hp;
}

export type DungeonDifficultyMeta = {
  recommendedPartyPower: number;
  minPartyLevel: number;
};

export function dungeonDifficultyMetaForStage(stage: DungeonStageDef): DungeonDifficultyMeta {
  return {
    recommendedPartyPower: recommendedPartyPowerForDungeonStage(stage),
    minPartyLevel: minimumPartyLevelForDungeonStage(stage),
  };
}
