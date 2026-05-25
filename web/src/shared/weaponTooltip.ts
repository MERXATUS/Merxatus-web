import { GAME_RULES } from "@/server/gameRules";
import { clampItemGrade, itemGradeLabel } from "@/server/itemGrade";

export type WeaponTooltipOption = {
  kind: string;
  label: string;
  tier: number;
  tierLabel: string;
  displayValue: number;
};

export type WeaponTooltipData = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  grade?: number;
  gradeLabel?: string;
  options?: WeaponTooltipOption[];
};

const WEAPON_OPTION_KINDS = new Set(["ATTACK", "MAGIC_POWER", "ATTACK_SPEED", "CRITICAL"]);

export function weaponBasePower(baseItemId: string): number {
  const map = GAME_RULES.combat.weaponPowerByItemId as Record<string, number>;
  const v = map[baseItemId];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function weaponEnhancePowerBonus(enhanceLevel: number): number {
  const lv = Math.max(0, Math.floor(enhanceLevel));
  return lv * GAME_RULES.combat.weaponLevelPowerPerLevel;
}

export function weaponOptionPowerBonus(options?: WeaponTooltipOption[]): number {
  if (!options?.length) return 0;
  let sum = 0;
  for (const o of options) {
    if (!WEAPON_OPTION_KINDS.has(o.kind)) continue;
    sum += Number(o.displayValue) || 0;
  }
  return Math.round(sum * 100) / 100;
}

export function weaponTotalPower(w: WeaponTooltipData): number {
  return (
    weaponBasePower(w.baseItemId) +
    weaponEnhancePowerBonus(w.enhanceLevel) +
    weaponOptionPowerBonus(w.options)
  );
}

export function weaponDisplayName(w: WeaponTooltipData): string {
  const base = w.name.trim() || w.baseItemId;
  const plus = w.enhanceLevel > 0 ? ` +${w.enhanceLevel}` : "";
  return `${base}${plus}`;
}

export function weaponGradeLabel(w: WeaponTooltipData): string {
  return w.gradeLabel ?? itemGradeLabel(w.grade ?? 1);
}

export function weaponGradeIndex(w: WeaponTooltipData): number {
  return clampItemGrade(w.grade ?? 1);
}
