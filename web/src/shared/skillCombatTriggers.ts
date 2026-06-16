import skillsCatalog from "../../data/minion_skills.json";
import type { CombatStatusId } from "@/shared/combatStatus";
import type { StatusApplySpec } from "@/shared/combatStatus";

export type SkillTriggerKind =
  | "always_skill_hit"
  | "proc_skill_hit"
  | "proc_extra_hit"
  | "parry"
  | "evade"
  | "nullify"
  | "stack_atk"
  | "stack_crit"
  | "heal_and_damage"
  | "inverse_hp_damage"
  | "armor_pen_strike"
  | "summon_sword"
  | "dancing_sword"
  | "low_hp_rebirth";

export type SkillTriggerSpec = {
  trigger: SkillTriggerKind;
  baseChancePct?: number;
  chancePctPerLevel?: number;
  damageMult?: number;
  damageMultPerLevel?: number;
  extraHitDamagePct?: number;
  extraHitDamagePctPerLevel?: number;
  counterDamagePct?: number;
  counterDamagePctPerLevel?: number;
  maxStacks?: number;
  stackBonusPct?: number;
  stackBonusPctPerLevel?: number;
  healMaxHpPct?: number;
  healMaxHpPctPerLevel?: number;
  damageFromHealMult?: number;
  maxDamageMult?: number;
  maxDamageMultPerLevel?: number;
  armorPenPct?: number;
  maxSwords?: number;
  maxSwordsPerLevel?: number;
  hitDamagePctPerSword?: number;
  hitDamagePctPerSwordPerLevel?: number;
  minSwords?: number;
  icdTurns?: number;
  hpThresholdPct?: number;
  healMissingHpPct?: number;
  healMissingHpPctPerLevel?: number;
  status?: CombatStatusId;
  chancePct?: number;
  turns?: number;
  potency?: number;
  maxStacksStatus?: number;
};

export type SkillPassiveMods = {
  dmgReducePct?: number;
  dmgReducePctPerLevel?: number;
  critChancePct?: number;
  critChancePctPerLevel?: number;
  lifeStealPct?: number;
  lifeStealPctPerLevel?: number;
  lowHpAtkMaxBonusPct?: number;
  lowHpAtkMaxBonusPctPerLevel?: number;
};

export type SkillCombatTriggerSet = {
  passiveMods?: SkillPassiveMods;
  onAttack?: SkillTriggerSpec[];
  onDamaged?: SkillTriggerSpec[];
  onActiveHit?: StatusApplySpec[];
};

export type SkillCombatTriggers = SkillCombatTriggerSet;

const TRIGGERS_BY_SKILL = new Map<string, SkillCombatTriggerSet>();
const SKILL_NAME_BY_ID = new Map<string, string>();

for (const raw of skillsCatalog.skills as Array<{ id: string; name?: string; combatTriggers?: SkillCombatTriggerSet }>) {
  if (raw.name) SKILL_NAME_BY_ID.set(raw.id, raw.name);
  if (raw.combatTriggers) TRIGGERS_BY_SKILL.set(raw.id, raw.combatTriggers);
}

export function skillNameById(skillId: string | null | undefined): string | null {
  if (!skillId) return null;
  return SKILL_NAME_BY_ID.get(skillId) ?? null;
}

export function skillCombatTriggers(skillId: string): SkillCombatTriggerSet | null {
  return TRIGGERS_BY_SKILL.get(skillId) ?? null;
}

export function scaleChancePct(spec: SkillTriggerSpec, skillLevel: number): number {
  const base = spec.baseChancePct ?? spec.chancePct ?? 0;
  const per = spec.chancePctPerLevel ?? 0;
  if (spec.trigger === "always_skill_hit") return 100;
  return Math.min(100, Math.max(0, Math.floor(base + per * Math.max(0, skillLevel - 1))));
}

export function scaleDamageMult(spec: SkillTriggerSpec, skillLevel: number): number {
  const base = spec.damageMult ?? 1;
  const per = spec.damageMultPerLevel ?? 0;
  return base + per * Math.max(0, skillLevel - 1);
}

export function scalePassiveMods(mods: SkillPassiveMods | undefined, skillLevel: number): SkillPassiveMods {
  if (!mods || skillLevel <= 0) return {};
  const lv = Math.max(0, skillLevel - 1);
  const scale = (base?: number, per?: number) =>
    base != null ? Math.floor(base + (per ?? 0) * lv) : undefined;
  return {
    dmgReducePct: scale(mods.dmgReducePct, mods.dmgReducePctPerLevel),
    critChancePct: scale(mods.critChancePct, mods.critChancePctPerLevel),
    lifeStealPct: scale(mods.lifeStealPct, mods.lifeStealPctPerLevel),
    lowHpAtkMaxBonusPct: scale(mods.lowHpAtkMaxBonusPct, mods.lowHpAtkMaxBonusPctPerLevel),
  };
}

export function scaleOnActiveHitSpecs(
  specs: StatusApplySpec[] | undefined,
  skillLevel: number,
): StatusApplySpec[] {
  if (!specs?.length || skillLevel <= 0) return [];
  return specs.map((s) => ({
    ...s,
    potency: Math.max(1, Math.floor(s.potency * (1 + (skillLevel - 1) * 0.1))),
    chancePct: Math.min(100, Math.floor(s.chancePct * (1 + (skillLevel - 1) * 0.04))),
  }));
}
