import skillsCatalog from "../../data/minion_skills.json";
import type { CombatStatusId, StatusApplySpec } from "@/shared/combatStatus";
import type { MinionCombatClass } from "@/shared/minionDerivedClass";
import { normalizeSkillLevelsForClass, parseMinionSkillLevels, skillDefById } from "@/shared/minionSkills";

export type SkillCombatEffects = {
  onFightStartSelf?: StatusApplySpec[];
  onActiveHit?: StatusApplySpec[];
  onActiveSelf?: StatusApplySpec[];
};

type SkillRow = {
  id: string;
  combatEffects?: SkillCombatEffects;
};

const EFFECTS_BY_SKILL = new Map<string, SkillCombatEffects>();
for (const raw of skillsCatalog.skills as SkillRow[]) {
  if (raw.combatEffects) EFFECTS_BY_SKILL.set(raw.id, raw.combatEffects);
}

export function skillCombatEffects(skillId: string): SkillCombatEffects | null {
  return EFFECTS_BY_SKILL.get(skillId) ?? null;
}

function scaleSpecs(specs: StatusApplySpec[] | undefined, skillLevel: number): StatusApplySpec[] {
  if (!specs?.length || skillLevel <= 0) return [];
  return specs.map((s) => ({
    ...s,
    potency: Math.max(1, Math.floor(s.potency * (1 + (skillLevel - 1) * 0.12))),
    chancePct: Math.min(100, Math.floor(s.chancePct * (1 + (skillLevel - 1) * 0.05))),
  }));
}

/** 습득한 모든 스킬의 패시브·발동 효과 합산 */
export function aggregateSkillCombatEffects(
  combatClass: MinionCombatClass,
  skillLevelsJson?: string | null,
): {
  onFightStartSelf: StatusApplySpec[];
  onActiveHit: StatusApplySpec[];
  onActiveSelf: StatusApplySpec[];
} {
  const levels = normalizeSkillLevelsForClass(combatClass, parseMinionSkillLevels(skillLevelsJson));
  const onFightStartSelf: StatusApplySpec[] = [];
  const onActiveHit: StatusApplySpec[] = [];
  const onActiveSelf: StatusApplySpec[] = [];

  for (const [id, lv] of Object.entries(levels)) {
    if (lv <= 0 || !skillDefById(id)) continue;
    const fx = EFFECTS_BY_SKILL.get(id);
    if (!fx) continue;
    onFightStartSelf.push(...scaleSpecs(fx.onFightStartSelf, lv));
    onActiveHit.push(...scaleSpecs(fx.onActiveHit, lv));
    onActiveSelf.push(...scaleSpecs(fx.onActiveSelf, lv));
  }

  return { onFightStartSelf, onActiveHit, onActiveSelf };
}

export function primarySkillOnActiveEffects(
  skillId: string | null | undefined,
  skillLevel: number,
): { onActiveHit: StatusApplySpec[]; onActiveSelf: StatusApplySpec[] } {
  if (!skillId || skillLevel <= 0) return { onActiveHit: [], onActiveSelf: [] };
  const fx = EFFECTS_BY_SKILL.get(skillId);
  if (!fx) return { onActiveHit: [], onActiveSelf: [] };
  return {
    onActiveHit: scaleSpecs(fx.onActiveHit, skillLevel),
    onActiveSelf: scaleSpecs(fx.onActiveSelf, skillLevel),
  };
}

export function isCombatStatusId(v: string): v is CombatStatusId {
  return v === "burn" || v === "shock" || v === "freeze" || v === "counter";
}
