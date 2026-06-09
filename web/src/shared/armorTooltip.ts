import { clampItemGrade, itemGradeLabel } from "@/server/itemGrade";
import type { OptionRealm } from "@/shared/equipmentBlessings";
import { blessedEquipmentDisplayName } from "@/shared/equipmentBlessings";
import { armorHpDefBonusFromOptionRows, armorUtilPowerBonusFromOptionRows } from "@/shared/itemOptionCatalog";
import { normalizeOptionId } from "@/shared/itemOptionCatalog";
import { ARMOR_LEVEL_STAT_PCT_PER_LEVEL } from "@/shared/armorEnhanceRules";
import { armorItemCombatPower, armorSlotLabelKo, getArmorStats } from "@/shared/armorStatsData";
import { weaponEnhancePowerBonus } from "@/shared/weaponTooltip";

export type ArmorTooltipOption = {
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

export type ArmorTooltipData = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel?: number; // default 0
  grade?: number;
  gradeLabel?: string;
  identified?: boolean;
  options?: ArmorTooltipOption[];
};

/** 강화 1단계당 HP·DEF — 베이스 스탯의 3% (전투 반영과 동일) */
export function armorEnhanceHpDefBonus(enhanceLevel: number, baseHp: number, baseDef: number) {
  const lv = Math.max(0, Math.floor(enhanceLevel));
  if (lv <= 0) return { hp: 0, def: 0 };
  const rate = ARMOR_LEVEL_STAT_PCT_PER_LEVEL;
  return {
    hp: Math.floor(baseHp * rate * lv),
    def: Math.floor(baseDef * rate * lv),
  };
}

export function armorEnhancePowerBonus(enhanceLevel: number): number {
  return weaponEnhancePowerBonus(enhanceLevel);
}

export function armorBaseHpDef(baseItemId: string): { hp: number; def: number; slot: string } | null {
  const s = getArmorStats(baseItemId);
  if (!s) return null;
  return { hp: s.hp, def: s.def, slot: s.slot };
}

export function armorOptionHpDefBonus(
  options: ArmorTooltipOption[] | undefined,
  baseHp: number,
  baseDef: number,
): { hp: number; def: number } {
  if (!options?.length) return { hp: 0, def: 0 };
  const rows = options
    .filter((o) => !o.hidden)
    .map((o) => ({
      optionId: normalizeOptionId(o.optionId ?? o.kind),
      tier: o.tier,
    }));
  return armorHpDefBonusFromOptionRows(rows, baseHp, baseDef);
}

export function armorDisplayName(a: ArmorTooltipData): string {
  const base = a.name.trim() || a.baseItemId;
  return blessedEquipmentDisplayName(
    base,
    a.options?.map((o) => ({ realm: o.realm, affix: o.affix })),
    a.enhanceLevel ?? 0,
  );
}

export function armorTotalPower(a: ArmorTooltipData): number {
  const base = armorBaseHpDef(a.baseItemId);
  const enhance = armorEnhancePowerBonus(a.enhanceLevel ?? 0);
  const utilRows = (a.options ?? [])
    .filter((o) => !o.hidden)
    .map((o) => ({
      optionId: normalizeOptionId(o.optionId ?? o.kind),
      tier: o.tier,
    }));
  const utilPower = armorUtilPowerBonusFromOptionRows(utilRows);
  if (!base) return armorItemCombatPower(a.baseItemId) + enhance + utilPower;
  const opt = armorOptionHpDefBonus(a.options, base.hp, base.def);
  return armorItemCombatPower(a.baseItemId) + Math.floor(opt.hp * 0.2 + opt.def * 2) + enhance + utilPower;
}

export function armorGradeLabel(a: ArmorTooltipData): string {
  return a.gradeLabel ?? itemGradeLabel(a.grade ?? 1);
}

export function armorGradeIndex(a: ArmorTooltipData): number {
  return clampItemGrade(a.grade ?? 1);
}
