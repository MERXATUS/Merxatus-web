import { cumulativeXpToLevel, MINION_LEVEL_RULES } from "@/shared/minionLevel";

/** 던전 스테이지 1개 정의 — 스테이지 추가 시 배열에 항목만 추가 */
export type DungeonStageDef = {
  stageOrder: number;
  dungeonIds: readonly string[];
  name: string;
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
 * | # | 이름           | 권장 Lv    | weight | 층 XP (base+floor×per) |
 * |---|----------------|------------|--------|------------------------|
 * | 1 | 슬라임의 숲    | 1~25       | 0.08   | 7 + f×3                |
 * | 2 | 고블린 굴      | 20~45      | 0.10   | 9 + f×3                |
 * | 3 | 늑대들의 계곡  | 40~70      | 0.11   | 11 + f×4               |
 * | 4 | 망자의 무덤    | 65~95      | 0.12   | 13 + f×4               |
 * | 5 | 화염 협곡      | 90~120     | 0.13   | 15 + f×5               |
 * | 6 | 얼음 요새      | 115~145    | 0.14   | 17 + f×5               |
 * | 7 | 용의 둥지      | 140~170    | 0.15   | 19 + f×6               |
 * | 8 | 심연의 균열    | 165~200    | 0.17   | 22 + f×6               |
 */
export const ACTIVE_DUNGEON_STAGES: readonly DungeonStageDef[] = [
  {
    stageOrder: 1,
    dungeonIds: ["dungeon_slime_forest"],
    name: "슬라임의 숲",
    recommendedLevel: 1,
    recommendedLevelMax: 25,
    journeyWeight: 0.08,
    floorXpBase: 7,
    floorXpPerFloor: 3,
  },
  {
    stageOrder: 2,
    dungeonIds: ["dungeon_goblin_den"],
    name: "고블린 굴",
    recommendedLevel: 20,
    recommendedLevelMax: 45,
    journeyWeight: 0.1,
    floorXpBase: 9,
    floorXpPerFloor: 3,
  },
  {
    stageOrder: 3,
    dungeonIds: ["dungeon_wolf_ravine"],
    name: "늑대들의 계곡",
    recommendedLevel: 40,
    recommendedLevelMax: 70,
    journeyWeight: 0.11,
    floorXpBase: 11,
    floorXpPerFloor: 4,
  },
  {
    stageOrder: 4,
    dungeonIds: ["dungeon_crypt_of_dead"],
    name: "망자의 무덤",
    recommendedLevel: 65,
    recommendedLevelMax: 95,
    journeyWeight: 0.12,
    floorXpBase: 13,
    floorXpPerFloor: 4,
  },
  {
    stageOrder: 5,
    dungeonIds: ["dungeon_scorch_rift"],
    name: "화염 협곡",
    recommendedLevel: 90,
    recommendedLevelMax: 120,
    journeyWeight: 0.13,
    floorXpBase: 15,
    floorXpPerFloor: 5,
  },
  {
    stageOrder: 6,
    dungeonIds: ["dungeon_frost_citadel"],
    name: "얼음 요새",
    recommendedLevel: 115,
    recommendedLevelMax: 145,
    journeyWeight: 0.14,
    floorXpBase: 17,
    floorXpPerFloor: 5,
  },
  {
    stageOrder: 7,
    dungeonIds: ["dungeon_dragon_roost"],
    name: "용의 둥지",
    recommendedLevel: 140,
    recommendedLevelMax: 170,
    journeyWeight: 0.15,
    floorXpBase: 19,
    floorXpPerFloor: 6,
  },
  {
    stageOrder: 8,
    dungeonIds: ["dungeon_void_rift"],
    name: "심연의 균열",
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

export function getDungeonStage(dungeonId: string): DungeonStageDef | null {
  return stageByDungeonId.get(dungeonId) ?? null;
}

export function assertDungeonStage(dungeonId: string): DungeonStageDef {
  const stage = getDungeonStage(dungeonId);
  if (!stage) throw new Error(`DUNGEON_STAGE_NOT_CONFIGURED:${dungeonId}`);
  return stage;
}

/** 스테이지·층 클리어 XP */
export function dungeonFloorXpForStage(dungeonId: string, floor: number): number {
  const stage = assertDungeonStage(dungeonId);
  const f = Math.max(1, Math.floor(floor));
  return stage.floorXpBase + f * stage.floorXpPerFloor;
}

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
  recommendedLevel: number;
  recommendedLevelMax: number;
  recommendedLevelLabel: string;
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
  return {
    stageOrder: stage.stageOrder,
    recommendedLevel: stage.recommendedLevel,
    recommendedLevelMax: stage.recommendedLevelMax,
    recommendedLevelLabel: formatRecommendedLevelLabel(stage),
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
      dungeonId,
      recommendedLevelLabel: formatRecommendedLevelLabel(stage),
      journeyWeight: stage.journeyWeight,
      journeyXpPool: Math.floor(DUNGEON_JOURNEY_TOTAL_XP * stage.journeyWeight),
      fullClearXp: dungeonId ? dungeonFullClearXpForStage(dungeonId, maxFloors) : 0,
      floorXpSample: dungeonId ? dungeonFloorXpForStage(dungeonId, maxFloors) : 0,
    };
  });
}
