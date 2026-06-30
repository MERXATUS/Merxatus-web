import type { DungeonStageDef } from "@/shared/dungeonStageProgression";

/** 입장 최소 파티 전투력 = 권장 × 비율 (레이드와 동일 척도) */
export const DUNGEON_MIN_PARTY_POWER_RATIO = 0.85;

/**
 * 스테이지 권장 파티 전투력 — 장비·강화 중심 성장(미니언 레벨 미반영).
 */
export function recommendedPartyPowerForDungeonStage(
  stage: Pick<DungeonStageDef, "stageOrder">,
): number {
  const order = Math.max(1, Math.min(8, Math.floor(stage.stageOrder)));
  const base = 8 + order * 22;
  const gear = Math.floor(12 + order * order * 4);
  return Math.max(5, base + gear);
}

export function minimumPartyPowerForDungeonStage(
  stage: Pick<DungeonStageDef, "stageOrder">,
): number {
  return minimumPartyPowerForDungeon(recommendedPartyPowerForDungeonStage(stage));
}

export function minimumPartyPowerForDungeon(recommendedPartyPower: number): number {
  const r = Math.max(1, Math.floor(recommendedPartyPower));
  return Math.ceil(r * DUNGEON_MIN_PARTY_POWER_RATIO);
}

export type DungeonPartyEligibility =
  | { ok: true }
  | { ok: false; code: "DUNGEON_PARTY_POWER_TOO_LOW"; minPower: number; partyPower: number };

/** 던전 입장 — 파티 합산 전투력 검사 */
export function checkDungeonPartyEligibility(input: {
  stage: Pick<DungeonStageDef, "stageOrder">;
  partyPower: number;
}): DungeonPartyEligibility {
  const minPower = minimumPartyPowerForDungeonStage(input.stage);
  const partyPower = Math.max(0, Math.floor(input.partyPower));
  if (partyPower < minPower) {
    return {
      ok: false,
      code: "DUNGEON_PARTY_POWER_TOO_LOW",
      minPower,
      partyPower,
    };
  }
  return { ok: true };
}

export function partyPowerAdequacyForDungeon(
  partyPower: number,
  recommendedPartyPower: number,
): "low" | "ok" | "high" {
  const p = Math.max(0, Math.floor(partyPower));
  const r = Math.max(1, Math.floor(recommendedPartyPower));
  const minRequired = minimumPartyPowerForDungeon(r);
  if (p < minRequired) return "low";
  if (p >= r * 1.15) return "high";
  return "ok";
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
  minPartyPower: number;
};

export function dungeonDifficultyMetaForStage(stage: DungeonStageDef): DungeonDifficultyMeta {
  const recommendedPartyPower = recommendedPartyPowerForDungeonStage(stage);
  return {
    recommendedPartyPower,
    minPartyPower: minimumPartyPowerForDungeon(recommendedPartyPower),
  };
}

export function formatDungeonPowerLabel(minPartyPower: number, recommendedPartyPower: number): string {
  return `전투력 ${minPartyPower.toLocaleString()}+ (권장 ${recommendedPartyPower.toLocaleString()})`;
}

/** @deprecated 레벨 게이트 제거 — 하위 호환용 스텁 */
export function minimumPartyLevelForDungeonStage(
  stage: Pick<DungeonStageDef, "stageOrder">,
): number {
  return minimumPartyPowerForDungeonStage(stage);
}

/** @deprecated */
export function averagePartyLevel(levels: number[]): number {
  if (!levels.length) return 0;
  const sum = levels.reduce((a, l) => a + Math.max(1, Math.floor(l)), 0);
  return sum / levels.length;
}
