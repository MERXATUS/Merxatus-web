import { cumulativeXpToLevel, MINION_EARLY_FAST_LEVEL, MINION_LEVEL_RULES } from "@/shared/minionLevel";
import { dungeonDifficultyMetaForStage } from "@/shared/dungeonDifficulty";

export type DungeonRealm = "마계" | "천계" | "이계";

/** 던전 스테이지 1개 정의 — 스테이지 추가 시 배열에 항목만 추가 */
export type DungeonStageDef = {
  stageOrder: number;
  dungeonIds: readonly string[];
  /** 스테이지 선택 탭·짧은 표기 */
  name: string;
  /** 삼계(천·마·이) 구분 */
  realm: DungeonRealm;
  recommendedLevel: number;
  recommendedLevelMax: number;
  /**
   * 만렙까지 여정 XP(`totalJourneyXp`) 중 이 스테이지 몫.
   * 활성 스테이지끼리 합이 1.0이 되도록 유지. (스테이지 추가 시 기존 weight 재분배)
   */
  journeyWeight: number;
  floorXpBase: number;
  floorXpPerFloor: number;
};

/** 만렙 200 / 6개월(180일×2h) 여정 총 EXP */
export const DUNGEON_JOURNEY_TOTAL_XP = cumulativeXpToLevel(MINION_LEVEL_RULES.maxLevel);

/** 8스테이지 여정 (만렙 200 기준, 구간 5레벨 겹침) */
export const DUNGEON_PLANNED_STAGE_SLOTS = 8;

/**
 * 8스테이지 로드맵 — journeyWeight 합 = 1.0
 *
 * | # | 영역 | 이름           | 권장 Lv    | weight |
 * |---|------|----------------|------------|--------|
 * | 1 | 마계 | 오염의 웅덩이  | 1~25       | 0.08   |
 * | 2 | 마계 | 군번의 심굴    | 20~45      | 0.10   |
 * | 3 | 마계 | 피의 사구      | 40~70      | 0.11   |
 * | 4 | 천계 | 낙천자의 묘    | 65~95      | 0.12   |
 * | 5 | 천계 | 심판의 화염    | 90~120     | 0.13   |
 * | 6 | 천계 | 서릿빛 성벽    | 115~145    | 0.14   |
 * | 7 | 이계 | 차원 용혈      | 140~170    | 0.15   |
 * | 8 | 이계 | 공허 균열      | 165~200    | 0.17   |
 */
export const ACTIVE_DUNGEON_STAGES: readonly DungeonStageDef[] = [
  {
    stageOrder: 1,
    dungeonIds: ["dungeon_slime_forest"],
    name: "오염의 웅덩이",
    realm: "마계",
    recommendedLevel: 1,
    recommendedLevelMax: 25,
    journeyWeight: 0.08,
    floorXpBase: 18,
    floorXpPerFloor: 8,
  },
  {
    stageOrder: 2,
    dungeonIds: ["dungeon_goblin_den"],
    name: "군번의 심굴",
    realm: "마계",
    recommendedLevel: 20,
    recommendedLevelMax: 45,
    journeyWeight: 0.1,
    floorXpBase: 22,
    floorXpPerFloor: 9,
  },
  {
    stageOrder: 3,
    dungeonIds: ["dungeon_wolf_ravine"],
    name: "피의 사구",
    realm: "마계",
    recommendedLevel: 40,
    recommendedLevelMax: 70,
    journeyWeight: 0.11,
    floorXpBase: 26,
    floorXpPerFloor: 10,
  },
  {
    stageOrder: 4,
    dungeonIds: ["dungeon_crypt_of_dead"],
    name: "낙천자의 묘",
    realm: "천계",
    recommendedLevel: 65,
    recommendedLevelMax: 95,
    journeyWeight: 0.12,
    floorXpBase: 13,
    floorXpPerFloor: 4,
  },
  {
    stageOrder: 5,
    dungeonIds: ["dungeon_scorch_rift"],
    name: "심판의 화염",
    realm: "천계",
    recommendedLevel: 90,
    recommendedLevelMax: 120,
    journeyWeight: 0.13,
    floorXpBase: 15,
    floorXpPerFloor: 5,
  },
  {
    stageOrder: 6,
    dungeonIds: ["dungeon_frost_citadel"],
    name: "서릿빛 성벽",
    realm: "천계",
    recommendedLevel: 115,
    recommendedLevelMax: 145,
    journeyWeight: 0.14,
    floorXpBase: 17,
    floorXpPerFloor: 5,
  },
  {
    stageOrder: 7,
    dungeonIds: ["dungeon_dragon_roost"],
    name: "차원 용혈",
    realm: "이계",
    recommendedLevel: 140,
    recommendedLevelMax: 170,
    journeyWeight: 0.15,
    floorXpBase: 19,
    floorXpPerFloor: 6,
  },
  {
    stageOrder: 8,
    dungeonIds: ["dungeon_void_rift"],
    name: "공허 균열",
    realm: "이계",
    recommendedLevel: 165,
    recommendedLevelMax: 200,
    journeyWeight: 0.17,
    floorXpBase: 22,
    floorXpPerFloor: 6,
  },
] as const;

const stageByDungeonId = new Map<string, DungeonStageDef>();
for (const stage of ACTIVE_DUNGEON_STAGES) {
  for (const id of stage.dungeonIds) stageByDungeonId.set(id, stage);
}

export function dungeonDisplayNameForStage(stage: Pick<DungeonStageDef, "realm" | "name">): string {
  return `${stage.realm} · ${stage.name}`;
}

export function getDungeonStage(dungeonId: string): DungeonStageDef | null {
  return stageByDungeonId.get(dungeonId) ?? null;
}

export function assertDungeonStage(dungeonId: string): DungeonStageDef {
  const stage = getDungeonStage(dungeonId);
  if (!stage) throw new Error(`DUNGEON_STAGE_NOT_CONFIGURED:${dungeonId}`);
  return stage;
}

/** 스테이지 1~3 층 XP 추가 배율 (Lv70까지 30~60분 여정) */
export const DUNGEON_EARLY_STAGE_XP_MULT = 1.35;

/** 스테이지·층 클리어 XP */
export function dungeonFloorXpForStage(dungeonId: string, floor: number): number {
  const stage = assertDungeonStage(dungeonId);
  const f = Math.max(1, Math.floor(floor));
  let xp = stage.floorXpBase + f * stage.floorXpPerFloor;
  if (stage.stageOrder <= 3) {
    xp = Math.floor(xp * DUNGEON_EARLY_STAGE_XP_MULT);
  }
  return xp;
}

export const DUNGEON_EARLY_LEVEL_TARGET = MINION_EARLY_FAST_LEVEL;

/** PUSH_LUCK 올클리어 1회 XP */
export function dungeonFullClearXpForStage(dungeonId: string, maxFloors: number): number {
  const n = Math.max(1, Math.floor(maxFloors));
  let sum = 0;
  for (let f = 1; f <= n; f++) sum += dungeonFloorXpForStage(dungeonId, f);
  return sum;
}

/** AUTO_WAVES 승리 1회 XP — 스테이지 풀클리어 대비 소량 */
export function dungeonAutoWaveXpForStage(dungeonId: string, maxFloors: number): number {
  const full = dungeonFullClearXpForStage(dungeonId, maxFloors);
  return Math.max(4, Math.floor(full / Math.max(8, maxFloors * 2)));
}

/** 이 스테이지에 할당된 여정 XP 풀 (밸런스·UI용) */
export function dungeonStageJourneyXpPool(dungeonId: string): number {
  const stage = assertDungeonStage(dungeonId);
  return Math.floor(DUNGEON_JOURNEY_TOTAL_XP * stage.journeyWeight);
}

export type DungeonStageMeta = {
  stageOrder: number;
  realm: DungeonRealm;
  recommendedLevel: number;
  recommendedLevelMax: number;
  recommendedLevelLabel: string;
  recommendedPartyPower: number;
  minPartyLevel: number;
  journeyXpPool: number;
  fullClearXp: number;
};

export function formatRecommendedLevelLabel(stage: Pick<DungeonStageDef, "recommendedLevel" | "recommendedLevelMax">) {
  if (stage.recommendedLevelMax <= stage.recommendedLevel) {
    return `Lv ${stage.recommendedLevel}+`;
  }
  return `Lv ${stage.recommendedLevel}~${stage.recommendedLevelMax}`;
}

export function dungeonStageMetaFor(dungeonId: string, maxFloors: number): DungeonStageMeta | null {
  const stage = getDungeonStage(dungeonId);
  if (!stage) return null;
  const difficulty = dungeonDifficultyMetaForStage(stage);
  return {
    stageOrder: stage.stageOrder,
    realm: stage.realm,
    recommendedLevel: stage.recommendedLevel,
    recommendedLevelMax: stage.recommendedLevelMax,
    recommendedLevelLabel: formatRecommendedLevelLabel(stage),
    recommendedPartyPower: difficulty.recommendedPartyPower,
    minPartyLevel: difficulty.minPartyLevel,
    journeyXpPool: dungeonStageJourneyXpPool(dungeonId),
    fullClearXp: dungeonFullClearXpForStage(dungeonId, maxFloors),
  };
}

/** API 응답용 — dungeons.json + 스테이지 메타 */
export function attachDungeonStageMeta<T extends { id: string; maxFloors?: number }>(dungeon: T) {
  const maxFloors = dungeon.maxFloors ?? 20;
  const stage = dungeonStageMetaFor(dungeon.id, maxFloors);
  return { ...dungeon, stage: stage ?? undefined };
}

/** 활성 weight 합 검증 (개발·테스트용) */
export function stageOrderForDungeonId(dungeonId: string): number | null {
  return getDungeonStage(dungeonId)?.stageOrder ?? null;
}

/** UI 스테이지 선택 — 스테이지당 대표 던전 id (복수 던전 시 첫 id) */
export function primaryDungeonIdForStage(stage: Pick<DungeonStageDef, "dungeonIds">): string | null {
  return stage.dungeonIds[0] ?? null;
}

export function dungeonIdForStageOrder(stageOrder: number): string | null {
  const stage = ACTIVE_DUNGEON_STAGES.find((s) => s.stageOrder === stageOrder);
  return stage ? primaryDungeonIdForStage(stage) : null;
}

/** 스테이지 선택 UI용 — `ACTIVE_DUNGEON_STAGES` 순서 유지 */
export function listDungeonStagePickerOptions() {
  return ACTIVE_DUNGEON_STAGES.map((stage) => ({
    stageOrder: stage.stageOrder,
    name: stage.name,
    realm: stage.realm,
    displayName: dungeonDisplayNameForStage(stage),
    recommendedLevelLabel: formatRecommendedLevelLabel(stage),
    dungeonIds: [...stage.dungeonIds],
    primaryDungeonId: primaryDungeonIdForStage(stage),
  }));
}

export function activeStageWeightSum(): number {
  return ACTIVE_DUNGEON_STAGES.reduce((s, st) => s + st.journeyWeight, 0);
}

/** UI·밸런스 시트용 스테이지 요약 */
export function listDungeonStageOverview(maxFloorsByDungeonId: Record<string, number> = {}) {
  return ACTIVE_DUNGEON_STAGES.map((stage) => {
    const dungeonId = primaryDungeonIdForStage(stage) ?? "";
    const maxFloors = maxFloorsByDungeonId[dungeonId] ?? 20;
    return {
      stageOrder: stage.stageOrder,
      name: stage.name,
      realm: stage.realm,
      displayName: dungeonDisplayNameForStage(stage),
      dungeonId,
      recommendedLevelLabel: formatRecommendedLevelLabel(stage),
      journeyWeight: stage.journeyWeight,
      journeyXpPool: Math.floor(DUNGEON_JOURNEY_TOTAL_XP * stage.journeyWeight),
      fullClearXp: dungeonId ? dungeonFullClearXpForStage(dungeonId, maxFloors) : 0,
      floorXpSample: dungeonId ? dungeonFloorXpForStage(dungeonId, maxFloors) : 0,
    };
  });
}
