import type { MinionJobType } from "@prisma/client";
import {
  minionCombatClassLabel,
  type MinionCombatClass,
} from "@/shared/minionDerivedClass";

export const MINION_JOB_LABEL: Record<MinionJobType, string> = {
  UNASSIGNED: "미배정",
  ADVENTURER: "모험가",
  MINER: "광부",
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

export function isDungeonPool(_pool?: string) {
  return true;
}

/** @deprecated 수집 풀 제거 */
export function isGatherPool(_pool?: string) {
  return false;
}

export function minionSupportsLeveling(_pool?: string) {
  return true;
}

/** @deprecated 항상 전투 미니언 */
export function isDungeonMinionJob(_jobType: string, _pool?: string) {
  return true;
}

/** @deprecated */
export function isGatherMinionJob(_jobType: string, _pool?: string) {
  return false;
}

export function poolLabel(_pool?: string): string {
  return "전투";
}

export function minionRoleLabel(input: { pool?: string; combatClass: MinionCombatClass }): string {
  return minionCombatClassLabel(input.combatClass);
}
