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
import { scaleCombatPower, scaleEquipmentCombatPower } from "@/shared/combatPowerScale";
import { getWeaponStats, weaponCombatPowerFromStats } from "@/shared/weaponStatsData";

export type WeaponTooltipOption = {
  kind: string;
  optionId?: string;
  label: string;
  tier: number;
  tierLabel: string;
  displayValue: number;
  isPercent?: boolean;
  flatBonus?: number;
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

/** 강화·옵션 계산용 raw CP */
export function weaponBasePowerRaw(baseItemId: string): number {
  const fromStats = weaponCombatPowerFromStats(baseItemId);
  if (fromStats > 0) return fromStats;
  const map = WEAPON_BASE_POWER_BY_ITEM_ID;
  const v = map[baseItemId];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** UI 표시용 CP */
export function weaponBasePower(baseItemId: string): number {
  return scaleEquipmentCombatPower(weaponBasePowerRaw(baseItemId));
}

export function weaponBaseAtkMagic(baseItemId: string): { atk: number; magic: number } | null {
  const s = getWeaponStats(baseItemId);
  if (!s) return null;
  return { atk: s.atk, magic: s.magic };
}

export function weaponEnhancePowerPerLevelForItem(baseItemId: string): number {
  return weaponEnhancePowerPerLevel(weaponBasePowerRaw(baseItemId));
}

export function weaponEnhancePowerBonus(baseItemId: string, enhanceLevel: number): number {
  return weaponEnhancePowerBonusFromBase(weaponBasePowerRaw(baseItemId), enhanceLevel);
}

/** UI 표시용 강화 CP */
export function weaponEnhancePowerDisplay(baseItemId: string, enhanceLevel: number): number {
  return scaleCombatPower(weaponEnhancePowerBonus(baseItemId, enhanceLevel));
}

export function weaponOptionPowerBonus(options?: WeaponTooltipOption[], baseItemId?: string): number {
  if (!options?.length) return 0;
  const rows = options.map((o) => ({
    optionId: normalizeOptionId(o.optionId ?? o.kind),
    tier: o.tier,
  }));
  const atkMagic = baseItemId ? weaponBaseAtkMagic(baseItemId) : null;
  return weaponPowerBonusFromOptionRows(rows, atkMagic?.atk ?? 0, atkMagic?.magic ?? 0);
}

export function weaponTotalPower(w: WeaponTooltipData): number {
  const raw =
    weaponBasePowerRaw(w.baseItemId) +
    weaponEnhancePowerBonus(w.baseItemId, w.enhanceLevel) +
    weaponOptionPowerBonus(w.options, w.baseItemId);
  return scaleCombatPower(Math.floor(raw * equipmentInstanceStatMultiplier(w.quality ?? 0, w.itemLevel ?? 10)));
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
