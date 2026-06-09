import type { EquipmentCombatModifiers } from "@/shared/equipmentCombatModifiers";

/**
 * 장비 유틸 옵션 — 전투 체감 보정 (표시 수치·드랍 테이블과 분리).
 * DPS 상한은 기존 cap(치명 80%, 공속 100% 등)으로 유지.
 */
const PROC_FEEL_MULT = 1.38;
const PASSIVE_PCT_FEEL_MULT = 1.18;
const LIFE_STEAL_FEEL_MULT = 2.4;
const LIFE_STEAL_EFFECTIVE_CAP = 32;
const LIFE_STEAL_HEAL_CAP_PCT_OF_DAMAGE = 38;

function scaleProcPct(raw: number, cap: number): number {
  return Math.min(cap, Math.max(0, raw) * PROC_FEEL_MULT);
}

function scalePassivePct(raw: number): number {
  return Math.max(0, raw) * PASSIVE_PCT_FEEL_MULT;
}

export function effectiveCritChancePct(raw: number): number {
  return scaleProcPct(raw, 80);
}

export function effectiveAtkSpdProcPct(raw: number): number {
  return scaleProcPct(raw, 100);
}

export function effectiveBlockPct(raw: number): number {
  return scaleProcPct(raw, 60);
}

export function effectiveEvasionPct(raw: number): number {
  return scaleProcPct(raw, 45);
}

export function effectiveCritResistPct(raw: number): number {
  return Math.min(70, scalePassivePct(raw));
}

export function effectiveThornPct(raw: number): number {
  return Math.min(50, scalePassivePct(raw));
}

export function effectiveArmorPenPct(raw: number): number {
  return Math.min(90, scalePassivePct(raw));
}

export function effectiveFinalDmgPct(raw: number): number {
  return scalePassivePct(raw);
}

export function effectiveDmgReducePct(raw: number): number {
  return Math.min(75, scalePassivePct(raw));
}

export function effectiveVsTagBonusPct(mods: EquipmentCombatModifiers, tags: {
  isBoss: boolean;
  isAngel: boolean;
  isDemon: boolean;
}): number {
  let bonus = 0;
  if (tags.isBoss) bonus += mods.dmgVsBossPct;
  if (tags.isAngel) bonus += mods.dmgVsAngelPct;
  if (tags.isDemon) bonus += mods.dmgVsDemonPct;
  return scalePassivePct(bonus);
}

export function effectiveLifeStealPct(raw: number): number {
  return Math.min(LIFE_STEAL_EFFECTIVE_CAP, Math.max(0, raw) * LIFE_STEAL_FEEL_MULT);
}

export function lifeStealHealAmount(damage: number, rawLifeStealPct: number): number {
  if (damage <= 0 || rawLifeStealPct <= 0) return 0;
  const pct = effectiveLifeStealPct(rawLifeStealPct);
  const cap = Math.max(1, Math.floor(damage * (LIFE_STEAL_HEAL_CAP_PCT_OF_DAMAGE / 100)));
  const heal = Math.floor(damage * (pct / 100));
  return Math.min(cap, Math.max(1, heal));
}
