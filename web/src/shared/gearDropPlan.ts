import { ACTIVE_DUNGEON_STAGES } from "@/shared/dungeonStageProgression";

/** 등급(1=일반 … 6=신화) 풀세트(무기+방어4) 목표 미니언 Lv */
export const GEAR_FULL_SET_TARGET_LV: Record<number, { min: number; max: number }> = {
  1: { min: 18, max: 20 },
  2: { min: 38, max: 42 },
  3: { min: 62, max: 65 },
  4: { min: 88, max: 92 },
  5: { min: 125, max: 135 },
  6: { min: 180, max: 190 },
};

/** 등급별 착용 가능 시작 Lv (reqLevel 테이블용) */
export const GEAR_EQUIP_FROM_LV: Record<number, number> = {
  1: 1,
  2: 20,
  3: 40,
  4: 65,
  5: 90,
  6: 140,
};

export const GEAR_DROP_MODE = "direct" as const;

export type GearDropStageRow = {
  stageOrder: number;
  stageName: string;
  dungeonId: string;
  maxFloors: number;
  grade: number;
  gradeLabel: string;
  setId: string;
  equipFromLv: number;
  fullSetTargetLabel: string;
  firstPieceFloor: number;
  fullSetFloorLabel: string;
  bossFloor: number;
  dropMode: "direct";
  previewSetId: string | null;
  notes: string;
};

/** `gear_drop_plan.csv`와 동기화 — UI·밸런스 참고용 */
export const GEAR_DROP_STAGE_PLAN: GearDropStageRow[] = [
  {
    stageOrder: 1,
    stageName: "슬라임의 숲",
    dungeonId: "dungeon_slime_forest",
    maxFloors: 10,
    grade: 1,
    gradeLabel: "일반",
    setId: "leather",
    equipFromLv: 1,
    fullSetTargetLabel: "Lv 18~20",
    firstPieceFloor: 4,
    fullSetFloorLabel: "8~9층",
    bossFloor: 10,
    dropMode: "direct",
    previewSetId: "crimson",
    notes: "가죽 세트 + 나무/돌 검 직접 드랍",
  },
  {
    stageOrder: 2,
    stageName: "고블린 굴",
    dungeonId: "dungeon_goblin_den",
    maxFloors: 14,
    grade: 2,
    gradeLabel: "레어",
    setId: "crimson",
    equipFromLv: 20,
    fullSetTargetLabel: "Lv 38~42",
    firstPieceFloor: 5,
    fullSetFloorLabel: "11~13층",
    bossFloor: 14,
    dropMode: "direct",
    previewSetId: "iron",
    notes: "적빛 세트",
  },
  {
    stageOrder: 3,
    stageName: "늑대들의 계곡",
    dungeonId: "dungeon_wolf_ravine",
    maxFloors: 16,
    grade: 3,
    gradeLabel: "유니크",
    setId: "iron",
    equipFromLv: 40,
    fullSetTargetLabel: "Lv 62~65",
    firstPieceFloor: 6,
    fullSetFloorLabel: "12~15층",
    bossFloor: 16,
    dropMode: "direct",
    previewSetId: "golden",
    notes: "철 세트",
  },
  {
    stageOrder: 4,
    stageName: "망자의 무덤",
    dungeonId: "dungeon_crypt_of_dead",
    maxFloors: 18,
    grade: 4,
    gradeLabel: "영웅",
    setId: "golden",
    equipFromLv: 65,
    fullSetTargetLabel: "Lv 88~92",
    firstPieceFloor: 7,
    fullSetFloorLabel: "14~17층",
    bossFloor: 18,
    dropMode: "direct",
    previewSetId: null,
    notes: "영웅 세트 추가 전: 금 세트",
  },
  {
    stageOrder: 5,
    stageName: "화염 협곡",
    dungeonId: "dungeon_scorch_rift",
    maxFloors: 20,
    grade: 5,
    gradeLabel: "전설",
    setId: "golden",
    equipFromLv: 90,
    fullSetTargetLabel: "Lv 125~135",
    firstPieceFloor: 8,
    fullSetFloorLabel: "16~19층",
    bossFloor: 20,
    dropMode: "direct",
    previewSetId: null,
    notes: "전설 전용 세트 추가 전",
  },
  {
    stageOrder: 6,
    stageName: "얼음 요새",
    dungeonId: "dungeon_frost_citadel",
    maxFloors: 22,
    grade: 5,
    gradeLabel: "전설",
    setId: "golden",
    equipFromLv: 90,
    fullSetTargetLabel: "Lv 125~135",
    firstPieceFloor: 9,
    fullSetFloorLabel: "18~21층",
    bossFloor: 22,
    dropMode: "direct",
    previewSetId: null,
    notes: "전설 파밍 연장",
  },
  {
    stageOrder: 7,
    stageName: "용의 둥지",
    dungeonId: "dungeon_dragon_roost",
    maxFloors: 24,
    grade: 6,
    gradeLabel: "신화",
    setId: "golden",
    equipFromLv: 140,
    fullSetTargetLabel: "Lv 180~190",
    firstPieceFloor: 10,
    fullSetFloorLabel: "20~23층",
    bossFloor: 24,
    dropMode: "direct",
    previewSetId: null,
    notes: "유니크 위주(풀 5부위 아님)",
  },
  {
    stageOrder: 8,
    stageName: "심연의 균열",
    dungeonId: "dungeon_void_rift",
    maxFloors: 26,
    grade: 6,
    gradeLabel: "신화",
    setId: "golden",
    equipFromLv: 140,
    fullSetTargetLabel: "Lv 180~190",
    firstPieceFloor: 11,
    fullSetFloorLabel: "22~25층",
    bossFloor: 26,
    dropMode: "direct",
    previewSetId: null,
    notes: "레이드 파편은 재료 드랍표",
  },
];

export function gearPlanForDungeonId(dungeonId: string): GearDropStageRow | null {
  return GEAR_DROP_STAGE_PLAN.find((r) => r.dungeonId === dungeonId) ?? null;
}

export function gearPlanForStageOrder(stageOrder: number): GearDropStageRow | null {
  return GEAR_DROP_STAGE_PLAN.find((r) => r.stageOrder === stageOrder) ?? null;
}

/** 던전 스테이지 메타 + 장비 드랍 계획 한 줄 요약 */
export function gearDropHintForStage(stageOrder: number): string | null {
  const plan = gearPlanForStageOrder(stageOrder);
  const stage = ACTIVE_DUNGEON_STAGES.find((s) => s.stageOrder === stageOrder);
  if (!plan || !stage) return null;
  return `${plan.gradeLabel} ${plan.fullSetTargetLabel} · ${plan.firstPieceFloor}층~ 장비 직접 드랍`;
}
