import type { MinionJobType } from "@prisma/client";

export const MINION_JOB_LABEL: Record<MinionJobType, string> = {
  UNASSIGNED: "미배정",
  MINER: "광부",
  FISHER: "낚시꾼",
  LUMBERJACK: "나무꾼",
  HERBALIST: "약초꾼",
  BLACKSMITH: "대장장이",
  JEWELER: "세공사",
  ALCHEMIST: "연금술사",
  COOK: "요리사",
  SCRAPPER: "고물상",
  WARRIOR: "전사",
  ARCHER: "궁수",
  MAGE: "마법사",
};

export const DUNGEON_JOB_TYPES: ReadonlySet<MinionJobType> = new Set<MinionJobType>(["WARRIOR", "ARCHER", "MAGE"]);

/**
 * WorkshopType.name 기준 마을 시설 **특화 직업** (배치 제한 아님 — 생산 보너스·시너지 판정용)
 */
export const ALLOWED_JOBS_BY_WORKSHOP_NAME: Record<string, readonly MinionJobType[]> = {
  광산: ["MINER"],
  낚시터: ["FISHER"],
  벌목장: ["LUMBERJACK"],
  산: ["HERBALIST"],

  대장간: ["BLACKSMITH"],
  세공소: ["JEWELER"],
  공방: ["ALCHEMIST"],
  주점: ["COOK"],
  분해소: ["SCRAPPER"],

  제련소: ["BLACKSMITH"],
  납품소: ["SCRAPPER"],
};

export function getAllowedJobsForWorkshopName(workshopName: string): readonly MinionJobType[] {
  return ALLOWED_JOBS_BY_WORKSHOP_NAME[workshopName] ?? [];
}

/** 특화 직업 목록 (UI 표시·보너스 계산). 예전 이름 호환 */
export function getPreferredJobsForWorkshopName(workshopName: string): readonly MinionJobType[] {
  return getAllowedJobsForWorkshopName(workshopName);
}

