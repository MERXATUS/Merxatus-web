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
  | "SHIELD_BLADE"
  | "BERSERKER"
  | "SWORD_MASTER"
  | "ARCANE_BLADE"
  | "CRUSADER";

export const MINION_COMBAT_CLASS_LABEL: Record<MinionCombatClass, string> = {
  ADVENTURER: "모험가",
  SWORDSMAN: "검사",
  WARRIOR: "전사",
  WIND_BLADE: "풍검사",
  MAGIC_BLADE: "마검사",
  SHIELD_BLADE: "성전사",
  BERSERKER: "광전사",
  SWORD_MASTER: "검성",
  ARCANE_BLADE: "마도검사",
  CRUSADER: "크루세이더",
};

const STAT_PRIORITY: MinionStatKey[] = ["strength", "agility", "intelligence", "endurance"];

const CLASS_BY_STAT: Record<MinionStatKey, MinionCombatClass> = {
  strength: "WARRIOR",
  agility: "WIND_BLADE",
  intelligence: "MAGIC_BLADE",
  endurance: "SHIELD_BLADE",
};

const MASTER_CLASS_BY_SECOND: Record<
  "WARRIOR" | "WIND_BLADE" | "MAGIC_BLADE" | "SHIELD_BLADE",
  MinionCombatClass
> = {
  WARRIOR: "BERSERKER",
  WIND_BLADE: "SWORD_MASTER",
  MAGIC_BLADE: "ARCANE_BLADE",
  SHIELD_BLADE: "CRUSADER",
};

const ADVANCED_CLASSES = new Set<MinionCombatClass>([
  "WARRIOR",
  "WIND_BLADE",
  "MAGIC_BLADE",
  "SHIELD_BLADE",
  "BERSERKER",
  "SWORD_MASTER",
  "ARCANE_BLADE",
  "CRUSADER",
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

/** 3차 전직 — 2차 클래스에서 승급 */
export function masterClassFromSecondClass(secondClass: MinionCombatClass): MinionCombatClass | null {
  if (secondClass === "WARRIOR") return "BERSERKER";
  if (secondClass === "WIND_BLADE") return "SWORD_MASTER";
  if (secondClass === "MAGIC_BLADE") return "ARCANE_BLADE";
  if (secondClass === "SHIELD_BLADE") return "CRUSADER";
  return null;
}

export function isAdvancedCombatClass(combatClass: MinionCombatClass): boolean {
  return ADVANCED_CLASSES.has(combatClass);
}

export function isMasterCombatClass(combatClass: MinionCombatClass): boolean {
  return (
    combatClass === "BERSERKER" ||
    combatClass === "SWORD_MASTER" ||
    combatClass === "ARCANE_BLADE" ||
    combatClass === "CRUSADER"
  );
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

export { MASTER_CLASS_BY_SECOND };
