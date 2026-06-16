import { COMBAT_STATUS_LABEL, type CombatStatusId } from "@/shared/combatStatusLabels";
import {
  scaleChancePct,
  scaleDamageMult,
  scaleOnActiveHitSpecs,
  scalePassiveMods,
  skillCombatTriggers,
  type SkillPassiveMods,
  type SkillTriggerSpec,
} from "@/shared/skillCombatTriggers";

function describeTrigger(spec: SkillTriggerSpec, level: number): string | null {
  const lv = Math.max(1, level);
  const chance = scaleChancePct(spec, lv);

  switch (spec.trigger) {
    case "always_skill_hit":
    case "proc_skill_hit": {
      const mult = scaleDamageMult(spec, lv);
      const dmgPct = Math.round(mult * 100);
      if (spec.trigger === "always_skill_hit") return `기본 공격 피해 ${dmgPct}%`;
      return `공격 시 ${chance}% 발동 · 피해 ${dmgPct}%`;
    }
    case "proc_extra_hit": {
      const dmg =
        (spec.extraHitDamagePct ?? 75) + (spec.extraHitDamagePctPerLevel ?? 0) * Math.max(0, lv - 1);
      return `공격 시 ${chance}% 발동 · 추가타 ${Math.round(dmg)}%`;
    }
    case "parry": {
      const counter =
        (spec.counterDamagePct ?? 85) + (spec.counterDamagePctPerLevel ?? 0) * Math.max(0, lv - 1);
      return `피격 시 ${chance}% · 피해 무효 + 반격 ${Math.round(counter)}%`;
    }
    case "evade":
      return `피격 시 ${chance}% · 공격 회피`;
    case "nullify":
      return `피격 시 ${chance}% · 피해 무효 (쿨 ${spec.icdTurns ?? 3}턴)`;
    case "stack_atk": {
      const per = (spec.stackBonusPct ?? 4) + (spec.stackBonusPctPerLevel ?? 0) * Math.max(0, lv - 1);
      return `공격 누적 · 공격력 +${formatPct(per)}%/중첩 (최대 ${spec.maxStacks ?? 6})`;
    }
    case "stack_crit":
      return `전투 중 치명 +${spec.stackBonusPct ?? 2}%/중첩 (최대 ${spec.maxStacks ?? 10})`;
    case "heal_and_damage": {
      const heal =
        (spec.healMaxHpPct ?? 8) + (spec.healMaxHpPctPerLevel ?? 0) * Math.max(0, lv - 1);
      return `공격 시 ${chance}% · HP ${formatPct(heal)}% 회복 + 회복량×${spec.damageFromHealMult ?? 1.6} 피해`;
    }
    case "inverse_hp_damage": {
      const maxMult =
        (spec.maxDamageMult ?? 2.8) + (spec.maxDamageMultPerLevel ?? 0) * Math.max(0, lv - 1);
      return `공격 시 ${chance}% · 체력 낮을수록 최대 ${Math.round(maxMult * 100)}%`;
    }
    case "armor_pen_strike": {
      const mult = scaleDamageMult(spec, lv);
      return `공격 시 ${chance}% · 방무 ${spec.armorPenPct ?? 100}% · 피해 ${Math.round(mult * 100)}%`;
    }
    case "summon_sword": {
      const max = Math.floor(
        (spec.maxSwords ?? 4) + (spec.maxSwordsPerLevel ?? 0) * Math.max(0, lv - 1),
      );
      return `공격 시 ${chance}% · 검 소환 (최대 ${max}자루 · 화염/냉기/번개/마력)`;
    }
    case "dancing_sword": {
      const hit =
        (spec.hitDamagePctPerSword ?? 70) +
        (spec.hitDamagePctPerSwordPerLevel ?? 0) * Math.max(0, lv - 1);
      return `공격 시 ${chance}% · 소환 검 전부 공격 (검당 ${Math.round(hit)}%, ${spec.minSwords ?? 2}자루 이상)`;
    }
    case "low_hp_rebirth": {
      const heal =
        (spec.healMissingHpPct ?? 38) + (spec.healMissingHpPctPerLevel ?? 0) * Math.max(0, lv - 1);
      return `HP ${spec.hpThresholdPct ?? 45}% 이하 · 공격 시 ${chance}% · 잃은 HP ${Math.round(heal)}% 회복+피해`;
    }
    default:
      return null;
  }
}

function describePassiveMods(mods: SkillPassiveMods, level: number): string[] {
  const scaled = scalePassiveMods(mods, level);
  const out: string[] = [];
  if (scaled.dmgReducePct) out.push(`받는 피해 -${scaled.dmgReducePct}%`);
  if (scaled.critChancePct) out.push(`치명타 +${scaled.critChancePct}%`);
  if (scaled.lifeStealPct) out.push(`흡혈 +${scaled.lifeStealPct}%`);
  if (scaled.lowHpAtkMaxBonusPct) out.push(`저체력 시 공격 최대 +${scaled.lowHpAtkMaxBonusPct}%`);
  return out;
}

function describeOnActiveHit(skillId: string, level: number): string | null {
  const triggers = skillCombatTriggers(skillId);
  if (!triggers?.onActiveHit?.length) return null;
  const scaled = scaleOnActiveHitSpecs(triggers.onActiveHit, level);
  const ids = [...new Set(scaled.map((s) => s.status))];
  if (ids.length >= 3) return "적중 시 화상·감전·빙결 중 랜덤";
  const parts = scaled.map((s) => {
    const label = COMBAT_STATUS_LABEL[s.status as CombatStatusId] ?? s.status;
    return `${label} ${s.chancePct}%`;
  });
  return `적중 시 ${parts.join(" · ")}`;
}

function formatPct(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** 스킬 Lv 기준 전투 효과 요약 (UI용) */
export function skillCombatPreviewLines(skillId: string, level: number): string[] {
  if (level <= 0) return [];
  const triggers = skillCombatTriggers(skillId);
  if (!triggers) return [];

  const lines: string[] = [];
  if (triggers.passiveMods) lines.push(...describePassiveMods(triggers.passiveMods, level));

  for (const spec of triggers.onDamaged ?? []) {
    const line = describeTrigger(spec, level);
    if (line) lines.push(line);
  }
  for (const spec of triggers.onAttack ?? []) {
    const line = describeTrigger(spec, level);
    if (line) lines.push(line);
  }

  const hitLine = describeOnActiveHit(skillId, level);
  if (hitLine) lines.push(hitLine);

  return lines;
}
