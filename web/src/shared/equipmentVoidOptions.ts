import voidOptionTiers from "../../data/void_option_tiers.json";
import type { OptionTierRow } from "@/shared/itemOptionCatalog";
import { normalizeOptionId, optionTierValue } from "@/shared/itemOptionCatalog";
import { filterOptionIdsForGrade } from "@/shared/optionTierBalance";

export type VoidOptionRealm = "void";

export const VOID_OPTION_CATALOG = voidOptionTiers as Record<string, OptionTierRow>;

export const VOID_WEAPON_OPTION_IDS = [
  "VOID_SKILL_DMG_ALL_PCT",
  "VOID_SKILL_SWORD_SLASH_PCT",
  "VOID_SKILL_SWORD_GUARD_PCT",
  "VOID_SKILL_WARRIOR_CLEAVE_PCT",
  "VOID_SKILL_WIND_RUSH_PCT",
  "VOID_SKILL_MAGIC_ARC_PCT",
  "VOID_ACTIVE_SKILL_HIT_PCT",
  "VOID_SKILL_CP_PCT",
] as const;

export const VOID_ARMOR_OPTION_IDS = [
  "VOID_SKILL_DMG_ALL_PCT",
  "VOID_HP_ON_SKILL_PCT",
  "VOID_DEF_VOID_PCT",
  "VOID_SKILL_THORN_PCT",
  "VOID_SKILL_CP_PCT",
] as const;

const VOID_AFFIXES = ["공허의", "균열의", "무의", "담금질된", "기억의", "파편의"] as const;

/** 공허 옵션 → 스킬 id (스킬별 피해 %) */
export const VOID_OPTION_SKILL_ID: Record<string, string> = {
  VOID_SKILL_SWORD_SLASH_PCT: "sword_slash",
  VOID_SKILL_SWORD_GUARD_PCT: "sword_guard",
  VOID_SKILL_WARRIOR_CLEAVE_PCT: "warrior_cleave",
  VOID_SKILL_WIND_RUSH_PCT: "wind_blade_rush",
  VOID_SKILL_MAGIC_ARC_PCT: "magic_blade_arc",
};

export function isVoidOptionId(optionId: string): boolean {
  const id = normalizeOptionId(optionId);
  return id in VOID_OPTION_CATALOG;
}

export function voidOptionIdsForPool(pool: "weapon" | "armor"): string[] {
  return [...(pool === "weapon" ? VOID_WEAPON_OPTION_IDS : VOID_ARMOR_OPTION_IDS)];
}

export function voidOptionIdsForGrade(pool: "weapon" | "armor", grade: number): string[] {
  return filterOptionIdsForGrade(voidOptionIdsForPool(pool), grade, pool);
}

export function voidOptionDisplayName(optionId: string): string {
  const id = normalizeOptionId(optionId);
  return VOID_OPTION_CATALOG[id]?.name ?? id;
}

export function voidOptionTierValue(optionId: string, tier: number): number {
  const id = normalizeOptionId(optionId);
  return optionTierValue(VOID_OPTION_CATALOG, id, tier);
}

export function rollVoidAffix(rnd = Math.random): string {
  return VOID_AFFIXES[Math.floor(rnd() * VOID_AFFIXES.length)] ?? "공허의";
}

export function voidRealmLabelKo(): string {
  return "공허";
}

export type VoidSkillBonuses = {
  allSkillDamagePct: number;
  activeSkillHitPct: number;
  skillPowerPct: number;
  skillDamagePctById: Record<string, number>;
};

export function emptyVoidSkillBonuses(): VoidSkillBonuses {
  return {
    allSkillDamagePct: 0,
    activeSkillHitPct: 0,
    skillPowerPct: 0,
    skillDamagePctById: {},
  };
}

export function voidSkillBonusesFromOptionRows(
  rows: Array<{ optionId: string; tier: number; realm?: string }>,
): VoidSkillBonuses {
  const out = emptyVoidSkillBonuses();
  for (const row of rows) {
    if (row.realm !== "void") continue;
    const id = normalizeOptionId(row.optionId);
    if (!isVoidOptionId(id)) continue;
    const v = voidOptionTierValue(id, row.tier);
    if (v <= 0) continue;

    if (id === "VOID_SKILL_DMG_ALL_PCT") out.allSkillDamagePct += v;
    else if (id === "VOID_ACTIVE_SKILL_HIT_PCT") out.activeSkillHitPct += v;
    else if (id === "VOID_SKILL_CP_PCT") out.skillPowerPct += v;
    else {
      const skillId = VOID_OPTION_SKILL_ID[id];
      if (skillId) {
        out.skillDamagePctById[skillId] = (out.skillDamagePctById[skillId] ?? 0) + v;
      }
    }
  }
  return out;
}

export function mergeVoidSkillBonuses(a: VoidSkillBonuses, b: VoidSkillBonuses): VoidSkillBonuses {
  const skillDamagePctById = { ...a.skillDamagePctById };
  for (const [k, v] of Object.entries(b.skillDamagePctById)) {
    skillDamagePctById[k] = (skillDamagePctById[k] ?? 0) + v;
  }
  return {
    allSkillDamagePct: a.allSkillDamagePct + b.allSkillDamagePct,
    activeSkillHitPct: a.activeSkillHitPct + b.activeSkillHitPct,
    skillPowerPct: a.skillPowerPct + b.skillPowerPct,
    skillDamagePctById,
  };
}

/** 스킬 피해 배율 (1 + pct/100) */
export function voidSkillDamageMultForSkill(
  bonuses: VoidSkillBonuses,
  skillId: string | null | undefined,
): number {
  let pct = bonuses.allSkillDamagePct;
  if (skillId && bonuses.skillDamagePctById[skillId]) {
    pct += bonuses.skillDamagePctById[skillId]!;
  }
  return pct > 0 ? 1 + pct / 100 : 1;
}
