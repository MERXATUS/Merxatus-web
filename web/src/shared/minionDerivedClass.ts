import type { MinionBaseStats, MinionStatKey } from "@/shared/minionBaseStats";

import { MINION_STAT_LABELS, totalMinionBaseStats } from "@/shared/minionBaseStats";

import { weaponArchetypeFromBaseItemId } from "@/shared/minionWeaponRules";



/** 검 + 주스탯 + 전직 단계로 결정되는 전투 클래스 */

export type MinionCombatClass =

  | "ADVENTURER"

  | "SWORDSMAN"

  | "WARRIOR"

  | "WIND_BLADE"

  | "MAGIC_BLADE"

  | "SHIELD_BLADE";



export const MINION_COMBAT_CLASS_LABEL: Record<MinionCombatClass, string> = {

  ADVENTURER: "모험가",

  SWORDSMAN: "검사",

  WARRIOR: "전사",

  WIND_BLADE: "바람 검사",

  MAGIC_BLADE: "마검사",

  SHIELD_BLADE: "방패검사",

};



const STAT_PRIORITY: MinionStatKey[] = ["strength", "agility", "intelligence", "endurance"];



const CLASS_BY_STAT: Record<MinionStatKey, MinionCombatClass> = {

  strength: "WARRIOR",

  agility: "WIND_BLADE",

  intelligence: "MAGIC_BLADE",

  endurance: "SHIELD_BLADE",

};



const ADVANCED_CLASSES = new Set<MinionCombatClass>([

  "WARRIOR",

  "WIND_BLADE",

  "MAGIC_BLADE",

  "SHIELD_BLADE",

]);



export function normalizeMinionCombatClass(raw: string): MinionCombatClass {

  const key = raw.toUpperCase() as MinionCombatClass;

  if (key in MINION_COMBAT_CLASS_LABEL) return key;

  return "ADVENTURER";

}



export function dominantStatKey(stats: MinionBaseStats): MinionStatKey {

  let best: MinionStatKey = "strength";

  let bestVal = stats.strength;

  for (const key of STAT_PRIORITY) {

    const v = stats[key];

    if (v > bestVal) {

      best = key;

      bestVal = v;

    }

  }

  return best;

}



/** 2차 전직 — 주스탯에 따른 특화 클래스 */

export function advancedClassFromStats(stats: MinionBaseStats): MinionCombatClass {

  return CLASS_BY_STAT[dominantStatKey(stats)];

}



export function isAdvancedCombatClass(combatClass: MinionCombatClass): boolean {

  return ADVANCED_CLASSES.has(combatClass);

}



/** @deprecated 즉시 파생 — 전직 게이트 없음. `resolveMinionCombatClass`(promotion) 사용 권장 */

export function deriveMinionCombatClass(input: {

  baseStats: MinionBaseStats;

  weaponBaseItemId?: string | null;

}): MinionCombatClass {

  const arch = input.weaponBaseItemId ? weaponArchetypeFromBaseItemId(input.weaponBaseItemId) : null;

  if (arch !== "SWORD") return "ADVENTURER";

  if (totalMinionBaseStats(input.baseStats) <= 0) return "ADVENTURER";

  return CLASS_BY_STAT[dominantStatKey(input.baseStats)];

}



export function minionCombatClassLabel(combatClass: MinionCombatClass): string {

  return MINION_COMBAT_CLASS_LABEL[combatClass];

}



/** 고용 후보 미리보기 — 신규 미니언은 모험가 */

export function previewRecruitCandidateLabel(baseStats: MinionBaseStats): string {

  if (totalMinionBaseStats(baseStats) <= 0) return "모험가 · 스탯 미배분";

  const dom = dominantStatKey(baseStats);

  return `모험가 · ${MINION_STAT_LABELS[dom]} ${baseStats[dom]} (전직 후 특화)`;

}

