/** 스테이지 던전(1~8) 방치 탐험 규칙 */
export const DUNGEON_IDLE_RULES = {
  /** 롤 1회 간격(초) */
  baseRollIntervalSeconds: 60,
  minRollIntervalSeconds: 60,
  /** 오프라인·방치 적립 상한 */
  offlineCapSeconds: 8 * 60 * 60,
  /** 장비 드랍 가중치 배율 (0.15 = 15%) */
  equipmentWeightFactor: 0.15,
  /** 방치 롤마다 상위 크래프팅(등급6+) 보너스 판정 확률 */
  rareCraftingBonusChance: 0.0045,
} as const;

export function idleRollIntervalSecondsForStage(_stageOrder: number): number {
  return DUNGEON_IDLE_RULES.baseRollIntervalSeconds;
}

export function idleGoldPerRoll(floor: number, stageOrder: number): number {
  const f = Math.max(1, Math.floor(floor));
  const stage = Math.max(1, Math.floor(stageOrder));
  const base = 6 + stage * 3;
  return Math.max(1, Math.floor(base * Math.sqrt(f)));
}

export function idleXpPerRoll(stageOrder: number): number {
  const stage = Math.max(1, Math.min(8, Math.floor(stageOrder)));
  return 12 + stage * 6;
}
