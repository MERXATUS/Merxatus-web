import type { MinionCombatClass } from "@/shared/minionDerivedClass";
import type { SkillCombatEffects } from "@/shared/combatSkillEffects";
import { skillCombatPreviewLines } from "@/shared/skillCombatPreview";
import skillsCatalog from "../../data/minion_skills.json";

/** 스킬 레벨업 — `gameRules.minion.skill`과 동기화 */
export const MINION_SKILL_RULES = {
  pointsPerLevel: skillsCatalog.rules.pointsPerLevel,
  promotionBonusPoints: skillsCatalog.rules.promotionBonusPoints,
} as const;

export type MinionSkillTier = 1 | 2 | 3 | 4;

export type MinionSkillKind = "passive" | "active";

export type MinionSkillDef = {
  id: string;
  name: string;
  description: string;
  kind: MinionSkillKind;
  tier: MinionSkillTier;
  /** @deprecated 상한 미사용 — 포인트만 있으면 자유 배분 */
  maxLevel?: number;
  powerPerLevel?: number;
  hpPerLevel?: number;
  defPerLevel?: number;
  /** 전투 피해 % (스킬별 합산 후 1 + sum/100) */
  damagePctPerLevel?: number;
  /** 대표 스킬 발동 타격 추가 피해 % (레벨당) */
  activeHitDamagePctPerLevel?: number;
  combatEffects?: SkillCombatEffects;
};

export type SkillCombatBonuses = {
  powerBonus: number;
  bonusHp: number;
  bonusDef: number;
  damageMult: number;
};

export type SkillBreakdownEntry = {
  id: string;
  name: string;
  tier: MinionSkillTier;
  level: number;
  effectSummary: string;
};

export type SkillBreakdown = {
  power: number;
  hp: number;
  def: number;
  damagePct: number;
  entries: SkillBreakdownEntry[];
};

const SKILL_BY_ID = new Map<string, MinionSkillDef>();
const CLASS_POOLS = skillsCatalog.classPools as Record<MinionCombatClass, string[]>;

for (const raw of skillsCatalog.skills) {
  SKILL_BY_ID.set(raw.id, raw as MinionSkillDef);
}

export function skillDefById(skillId: string): MinionSkillDef | null {
  return SKILL_BY_ID.get(skillId) ?? null;
}

export function skillsForCombatClass(combatClass: MinionCombatClass): MinionSkillDef[] {
  const ids = CLASS_POOLS[combatClass] ?? CLASS_POOLS.ADVENTURER;
  const out: MinionSkillDef[] = [];
  for (const id of ids) {
    const def = SKILL_BY_ID.get(id);
    if (def) out.push(def);
  }
  return out;
}

export type MinionSkillLevels = Record<string, number>;

const LEGACY_SKILL_ID_MAP: Record<string, string> = {
  adventure_strike: "basic_strike",
};

export function parseMinionSkillLevels(json: string | null | undefined): MinionSkillLevels {
  if (!json || json === "{}") return {};
  try {
    const v = JSON.parse(json) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: MinionSkillLevels = {};
    for (const [k, raw] of Object.entries(v)) {
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      const lv = Math.floor(raw);
      if (lv <= 0) continue;
      const id = LEGACY_SKILL_ID_MAP[k] ?? k;
      out[id] = Math.max(out[id] ?? 0, lv);
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeMinionSkillLevels(levels: MinionSkillLevels): string {
  const out: MinionSkillLevels = {};
  for (const [k, v] of Object.entries(levels)) {
    const lv = Math.floor(v);
    if (lv > 0) out[k] = lv;
  }
  return JSON.stringify(out);
}

/** 전직·클래스에 맞는 스킬만 유지 */
export function normalizeSkillLevelsForClass(
  combatClass: MinionCombatClass,
  levels: MinionSkillLevels,
): MinionSkillLevels {
  const allowed = new Set(skillsForCombatClass(combatClass).map((s) => s.id));
  const out: MinionSkillLevels = {};
  for (const [id, lv] of Object.entries(levels)) {
    if (!allowed.has(id)) continue;
    const def = skillDefById(id);
    if (!def) continue;
    out[id] = Math.max(0, Math.floor(lv));
  }
  return out;
}

/** 신규 미니언·빈 스킬 JSON — 1티어 기본 스킬만 Lv1 */
export function defaultSkillLevelsForClass(combatClass: MinionCombatClass): MinionSkillLevels {
  const out: MinionSkillLevels = {};
  for (const s of skillsForCombatClass(combatClass)) {
    if (s.tier === 1) out[s.id] = 1;
  }
  return out;
}

/** 전직 시 클래스 풀 정리 + 해당 티어 패시브·액티브 Lv1 자동 습득 */
export function mergeSkillLevelsOnPromotion(
  combatClass: MinionCombatClass,
  prev: MinionSkillLevels,
  promotionTier?: number,
): MinionSkillLevels {
  const out = normalizeSkillLevelsForClass(combatClass, { ...prev });
  if (promotionTier == null || promotionTier < 1) return out;
  const unlockSkillTier = Math.min(4, promotionTier + 1) as MinionSkillTier;
  for (const s of skillsForCombatClass(combatClass)) {
    if (s.tier !== unlockSkillTier) continue;
    if ((out[s.id] ?? 0) < 1) out[s.id] = 1;
  }
  return out;
}

/** 전직 단계까지 자동 습득된 기본 스킬 레벨 */
export function baselineSkillLevelsForPromotion(
  combatClass: MinionCombatClass,
  promotionTier: number,
): MinionSkillLevels {
  let levels = defaultSkillLevelsForClass(combatClass);
  const tier = Math.max(0, Math.floor(promotionTier));
  for (let t = 1; t <= tier; t++) {
    levels = mergeSkillLevelsOnPromotion(combatClass, levels, t);
  }
  return normalizeSkillLevelsForClass(combatClass, levels);
}

/** 레벨·전직으로 획득한 총 스킬 포인트 */
export function totalEarnedSkillPoints(level: number, promotionTier: number): number {
  const lv = Math.max(1, Math.floor(level));
  const promo = Math.max(0, Math.floor(promotionTier));
  return (
    Math.max(0, lv - 1) * MINION_SKILL_RULES.pointsPerLevel +
    promo * MINION_SKILL_RULES.promotionBonusPoints
  );
}

/** 기본 습득(Lv1) 대비 추가로 투자한 스킬 포인트 */
export function skillPointsSpentAboveBaseline(
  combatClass: MinionCombatClass,
  promotionTier: number,
  levels: MinionSkillLevels,
): number {
  const baseline = baselineSkillLevelsForPromotion(combatClass, promotionTier);
  const normalized = normalizeSkillLevelsForClass(combatClass, levels);
  let spent = 0;
  for (const s of skillsForCombatClass(combatClass)) {
    const cur = normalized[s.id] ?? 0;
    const base = baseline[s.id] ?? 0;
    if (cur > base) spent += cur - base;
  }
  return spent;
}

export function primarySkillActiveDamageMult(skillId: string, level: number): number {
  const def = skillDefById(skillId);
  if (!def || level <= 0) return 1;
  const pct = (def.activeHitDamagePctPerLevel ?? 0) * level;
  return 1 + pct / 100;
}

function primarySkillForKind(
  combatClass: MinionCombatClass,
  skillLevelsJson: string | null | undefined,
  kind: MinionSkillKind,
): { id: string; name: string; level: number } | null {
  const levels = normalizeSkillLevelsForClass(combatClass, parseMinionSkillLevels(skillLevelsJson));
  let best: MinionSkillDef | null = null;
  let bestLevel = 0;
  let bestTier = 0;
  for (const s of skillsForCombatClass(combatClass)) {
    if (s.kind !== kind) continue;
    const lv = levels[s.id] ?? 0;
    if (lv <= 0) continue;
    if (s.tier > bestTier || (s.tier === bestTier && lv > bestLevel)) {
      bestTier = s.tier;
      best = s;
      bestLevel = lv;
    }
  }
  return best ? { id: best.id, name: best.name, level: bestLevel } : null;
}

/** 전투 액티브 스킬 — 최고 티어 액티브 1개 */
export function primaryActiveSkillForMinion(
  combatClass: MinionCombatClass,
  skillLevelsJson?: string | null,
): { id: string; name: string; level: number } | null {
  return primarySkillForKind(combatClass, skillLevelsJson, "active");
}

/** 전투 패시브 스킬 — 최고 티어 패시브 1개 */
export function primaryPassiveSkillForMinion(
  combatClass: MinionCombatClass,
  skillLevelsJson?: string | null,
): { id: string; name: string; level: number } | null {
  return primarySkillForKind(combatClass, skillLevelsJson, "passive");
}

/** @deprecated — `primaryActiveSkillForMinion` 사용 */
export function primaryCombatSkillForMinion(
  combatClass: MinionCombatClass,
  skillLevelsJson?: string | null,
): { id: string; name: string; level: number } | null {
  return primaryActiveSkillForMinion(combatClass, skillLevelsJson);
}

export function aggregateSkillCombatBonuses(
  combatClass: MinionCombatClass,
  levels: MinionSkillLevels,
): SkillCombatBonuses {
  const normalized = normalizeSkillLevelsForClass(combatClass, levels);
  let powerBonus = 0;
  let bonusHp = 0;
  let bonusDef = 0;
  let damagePct = 0;

  for (const s of skillsForCombatClass(combatClass)) {
    const lv = normalized[s.id] ?? 0;
    if (lv <= 0) continue;
    powerBonus += (s.powerPerLevel ?? 0) * lv;
    bonusHp += (s.hpPerLevel ?? 0) * lv;
    bonusDef += (s.defPerLevel ?? 0) * lv;
    damagePct += (s.damagePctPerLevel ?? 0) * lv;
  }

  return {
    powerBonus: Math.floor(powerBonus),
    bonusHp: Math.floor(bonusHp),
    bonusDef: Math.floor(bonusDef),
    damageMult: 1 + damagePct / 100,
  };
}

export function skillBreakdownForClass(
  combatClass: MinionCombatClass,
  skillLevelsJson?: string | null,
): SkillBreakdown | null {
  const levels = normalizeSkillLevelsForClass(
    combatClass,
    parseMinionSkillLevels(skillLevelsJson),
  );
  const bonuses = aggregateSkillCombatBonuses(combatClass, levels);
  const entries: SkillBreakdownEntry[] = [];
  for (const s of skillsForCombatClass(combatClass)) {
    const level = levels[s.id] ?? 0;
    if (level <= 0) continue;
    entries.push({
      id: s.id,
      name: s.name,
      tier: s.tier,
      level,
      effectSummary: skillEffectSummary(s, level),
    });
  }
  if (entries.length === 0) return null;
  return {
    power: bonuses.powerBonus,
    hp: bonuses.bonusHp,
    def: bonuses.bonusDef,
    damagePct: Math.round((bonuses.damageMult - 1) * 1000) / 10,
    entries,
  };
}

function skillEffectSummary(def: MinionSkillDef, level: number): string {
  const parts: string[] = [];
  if (def.powerPerLevel) parts.push(`전투력 +${def.powerPerLevel * level}`);
  if (def.hpPerLevel) parts.push(`HP +${def.hpPerLevel * level}`);
  if (def.defPerLevel) parts.push(`DEF +${def.defPerLevel * level}`);
  if (def.damagePctPerLevel) parts.push(`피해 +${(def.damagePctPerLevel * level).toFixed(1)}%`);
  if (def.activeHitDamagePctPerLevel) {
    parts.push(`스킬타 +${(def.activeHitDamagePctPerLevel * level).toFixed(1)}%`);
  }
  parts.push(...skillCombatPreviewLines(def.id, level));
  return parts.length > 0 ? parts.join(" · ") : def.description;
}

/** UI용 — 전투 효과를 줄 단위로 */
export function skillCombatPreviewForDef(def: MinionSkillDef, level: number): string[] {
  return skillCombatPreviewLines(def.id, level);
}

export function skillPreviewText(def: MinionSkillDef, level: number): string {
  return skillEffectSummary(def, level);
}

const TIER_LABELS: Record<MinionSkillTier, string> = {
  1: "기본",
  2: "검사",
  3: "2차",
  4: "3차",
};

const KIND_LABELS: Record<MinionSkillKind, string> = {
  passive: "패시브",
  active: "액티브",
};

function acquireHintForSkill(def: MinionSkillDef, level: number): string {
  if (level > 0) return skillEffectSummary(def, level);
  const preview = skillCombatPreviewLines(def.id, 1);
  if (preview.length > 0) return `습득 시(Lv1) · ${preview.join(" · ")}`;
  if (def.tier === 1) return "기본 스킬";
  if (def.tier === 2) return "1차 전직(검사) 시 습득";
  if (def.tier === 3) return "2차 전직 시 습득";
  return "3차 전직(Lv140) 시 습득";
}

export type MinionSkillView = {
  id: string;
  name: string;
  description: string;
  kind: MinionSkillKind;
  kindLabel: string;
  tier: MinionSkillTier;
  tierLabel: string;
  level: number;
  effectSummary: string;
  combatPreview: string[];
  acquireHint: string;
  unlocked: boolean;
};

export function skillViewsForMinion(input: {
  combatClass: MinionCombatClass;
  skillLevelsJson?: string | null;
}): MinionSkillView[] {
  const levels = normalizeSkillLevelsForClass(
    input.combatClass,
    parseMinionSkillLevels(input.skillLevelsJson),
  );
  return skillsForCombatClass(input.combatClass).map((def) => {
    const level = levels[def.id] ?? 0;
    const previewLevel = level > 0 ? level : 1;
    const combatPreview = skillCombatPreviewLines(def.id, previewLevel);
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      kind: def.kind,
      kindLabel: KIND_LABELS[def.kind],
      tier: def.tier,
      tierLabel: TIER_LABELS[def.tier],
      level,
      unlocked: level > 0,
      effectSummary: level > 0 ? skillEffectSummary(def, level) : "",
      combatPreview,
      acquireHint: acquireHintForSkill(def, level),
    };
  });
}

/** @deprecated — `skillViewsForMinion` 사용 */
export function skillViewsForCombatClass(combatClass: MinionCombatClass): MinionSkillView[] {
  return skillViewsForMinion({
    combatClass,
    skillLevelsJson: serializeMinionSkillLevels(defaultSkillLevelsForClass(combatClass)),
  });
}
