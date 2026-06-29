import { clampItemGrade, itemGradeLabel } from "@/server/itemGrade";
import {
  WEAPON_BASE_POWER_BY_ITEM_ID,
  weaponEnhancePowerBonusFromBase,
  weaponEnhancePowerPerLevel,
} from "@/shared/weaponPowerRules";
import { weaponPowerBonusFromOptionRows } from "@/shared/itemOptionCatalog";
import type { EquippedByMinionView } from "@/shared/equipmentEquippedBy";
import type { OptionRealm } from "@/shared/equipmentBlessings";
import { blessedEquipmentDisplayName } from "@/shared/equipmentBlessings";
import { normalizeOptionId } from "@/shared/itemOptionCatalog";
import { equipmentInstanceStatMultiplier } from "@/shared/equipmentItemLevel";
import { getWeaponStats, weaponCombatPowerFromStats } from "@/shared/weaponStatsData";

export type WeaponTooltipOption = {
  kind: string;
  optionId?: string;
  label: string;
  tier: number;
  tierLabel: string;
  displayValue: number;
  hidden?: boolean;
  locked?: boolean;
  realm?: OptionRealm;
  affix?: string | null;
  realmLabel?: string;
};

export type WeaponTooltipData = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  grade?: number;
  gradeLabel?: string;
  identified?: boolean;
  quality?: number;
  qualityCraftCount?: number;
  itemLevel?: number;
  options?: WeaponTooltipOption[];
  equippedByMinion?: EquippedByMinionView | null;
};

export function weaponBasePower(baseItemId: string): number {
  const fromStats = weaponCombatPowerFromStats(baseItemId);
  if (fromStats > 0) return fromStats;
  const map = WEAPON_BASE_POWER_BY_ITEM_ID;
  const v = map[baseItemId];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function weaponBaseAtkMagic(baseItemId: string): { atk: number; magic: number } | null {
  const s = getWeaponStats(baseItemId);
  if (!s) return null;
  return { atk: s.atk, magic: s.magic };
}

export function weaponEnhancePowerPerLevelForItem(baseItemId: string): number {
  return weaponEnhancePowerPerLevel(weaponBasePower(baseItemId));
}

export function weaponEnhancePowerBonus(baseItemId: string, enhanceLevel: number): number {
  return weaponEnhancePowerBonusFromBase(weaponBasePower(baseItemId), enhanceLevel);
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
  const raw =
    weaponBasePower(w.baseItemId) +
    weaponEnhancePowerBonus(w.baseItemId, w.enhanceLevel) +
    weaponOptionPowerBonus(w.options);
  return Math.floor(raw * equipmentInstanceStatMultiplier(w.quality ?? 0, w.itemLevel ?? 10));
}

export function weaponDisplayName(w: WeaponTooltipData): string {
  const base = (w.name ?? "").trim() || w.baseItemId;
  return blessedEquipmentDisplayName(
    base,
    w.options?.map((o) => ({ realm: o.realm, affix: o.affix })),
    w.enhanceLevel,
  );
}

export function weaponGradeLabel(w: WeaponTooltipData): string {
  return w.gradeLabel ?? itemGradeLabel(w.grade ?? 1);
}

export function weaponGradeIndex(w: WeaponTooltipData): number {
  return clampItemGrade(w.grade ?? 1);
}
