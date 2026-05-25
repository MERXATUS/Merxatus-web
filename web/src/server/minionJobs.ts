import type { MinionJobType } from "@prisma/client";

export const MINION_JOB_LABEL: Record<MinionJobType, string> = {
  UNASSIGNED: "미배정",
  MINER: "광부",
  // legacy: 낚시터/낚시꾼은 컨텐츠에서 제거되었지만,
  // DB에 남아있을 수 있어 타입 안정성을 위해 라벨만 유지한다.
  FISHER: "낚시꾼",
  ARCHAEOLOGIST: "고고학자",
  EXPLORER: "탐험가",
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

/** 수집·작업장 배치용 미니언 직업 */
export const GATHER_JOB_TYPES: ReadonlySet<MinionJobType> = new Set<MinionJobType>([
  "MINER",
  "FISHER",
  "ARCHAEOLOGIST",
  "EXPLORER",
]);

export function isDungeonMinionJob(jobType: string) {
  return DUNGEON_JOB_TYPES.has(jobType as MinionJobType);
}

export function isGatherMinionJob(jobType: string) {
  return GATHER_JOB_TYPES.has(jobType as MinionJobType);
}

/** 수집(GATHER) 시설 — 배치 가능한 미니언 직업 (시설당 1종) */
export const ALLOWED_JOBS_BY_WORKSHOP_NAME: Record<string, readonly MinionJobType[]> = {
  광산: ["MINER"],
  낚시터: ["FISHER"],
  탐험: ["EXPLORER"],
  고고학: ["ARCHAEOLOGIST"],
};

export function getAllowedJobsForWorkshopName(workshopName: string): readonly MinionJobType[] {
  return ALLOWED_JOBS_BY_WORKSHOP_NAME[workshopName] ?? [];
}

/** 특화 직업 목록 (UI 표시·보너스 계산) */
export function getPreferredJobsForWorkshopName(workshopName: string): readonly MinionJobType[] {
  return getAllowedJobsForWorkshopName(workshopName);
}

export function isMinionJobAllowedAtGatherWorkshop(workshopName: string, jobType: string): boolean {
  const allowed = getAllowedJobsForWorkshopName(workshopName);
  if (allowed.length === 0) return true;
  return allowed.includes(jobType as MinionJobType);
}

export function assertMinionJobAllowedAtGatherWorkshop(workshopName: string, jobType: string) {
  if (isMinionJobAllowedAtGatherWorkshop(workshopName, jobType)) return;
  const labels = getAllowedJobsForWorkshopName(workshopName)
    .map((j) => MINION_JOB_LABEL[j])
    .join(", ");
  throw new Error(
    labels
      ? `MINION_JOB_NOT_ALLOWED_FOR_WORKSHOP:${workshopName}:${labels}`
      : "MINION_JOB_NOT_ALLOWED_FOR_WORKSHOP",
  );
}

export function gatherWorkshopAllowedJobLabels(workshopName: string): string {
  return getAllowedJobsForWorkshopName(workshopName)
    .map((j) => MINION_JOB_LABEL[j])
    .join(", ");
}

