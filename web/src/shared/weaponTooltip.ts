import { GAME_RULES } from "@/server/gameRules";
import { clampItemGrade, itemGradeLabel } from "@/server/itemGrade";
import { weaponPowerBonusFromOptionRows } from "@/shared/itemOptionCatalog";
import { normalizeOptionId } from "@/shared/itemOptionCatalog";
import { getWeaponStats, weaponCombatPowerFromStats } from "@/shared/weaponStatsData";

export type WeaponTooltipOption = {
  kind: string;
  optionId?: string;
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

export function weaponBasePower(baseItemId: string): number {
  const fromStats = weaponCombatPowerFromStats(baseItemId);
  if (fromStats > 0) return fromStats;
  const map = GAME_RULES.combat.weaponPowerByItemId as Record<string, number>;
  const v = map[baseItemId];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function weaponBaseAtkMagic(baseItemId: string): { atk: number; magic: number } | null {
  const s = getWeaponStats(baseItemId);
  if (!s) return null;
  return { atk: s.atk, magic: s.magic };
}

export function weaponEnhancePowerBonus(enhanceLevel: number): number {
  const lv = Math.max(0, Math.floor(enhanceLevel));
  return lv * GAME_RULES.combat.weaponLevelPowerPerLevel;
}

export function weaponOptionPowerBonus(options?: WeaponTooltipOption[]): number {
  if (!options?.length) return 0;
  const rows = options.map((o) => ({
    optionId: normalizeOptionId(o.optionId ?? o.kind),
    tier: o.tier,
  }));
  return weaponPowerBonusFromOptionRows(rows);
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
