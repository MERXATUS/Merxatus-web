import { clampItemGrade, itemGradeLabel } from "@/server/itemGrade";
import type { EquippedByMinionView } from "@/shared/equipmentEquippedBy";
import type { OptionRealm } from "@/shared/equipmentBlessings";
import { blessedEquipmentDisplayName } from "@/shared/equipmentBlessings";
import { armorHpDefBonusFromOptionRows, armorUtilPowerBonusFromOptionRows } from "@/shared/itemOptionCatalog";
import { normalizeOptionId } from "@/shared/itemOptionCatalog";
import { ARMOR_LEVEL_STAT_PCT_PER_LEVEL } from "@/shared/armorEnhanceRules";
import { equipmentInstanceStatMultiplier } from "@/shared/equipmentItemLevel";
import {
  armorItemCombatPower,
  armorSlotLabelKo,
  getArmorStats,
  hpDefToArmorCombatPower,
} from "@/shared/armorStatsData";

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
  quality?: number;
  qualityCraftCount?: number;
  itemLevel?: number;
  options?: ArmorTooltipOption[];
  equippedByMinion?: EquippedByMinionView | null;
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

/** 강화로 추가된 HP·DEF를 베이스 방어구와 동일 공식으로 CP 환산 */
export function armorEnhancePowerBonus(baseItemId: string, enhanceLevel: number): number {
  const base = armorBaseHpDef(baseItemId);
  if (!base) return 0;
  const { hp, def } = armorEnhanceHpDefBonus(enhanceLevel, base.hp, base.def);
  return hpDefToArmorCombatPower(hp, def);
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
  const enhance = armorEnhancePowerBonus(a.baseItemId, a.enhanceLevel ?? 0);
  const utilRows = (a.options ?? [])
    .filter((o) => !o.hidden)
    .map((o) => ({
      optionId: normalizeOptionId(o.optionId ?? o.kind),
      tier: o.tier,
    }));
  const utilPower = armorUtilPowerBonusFromOptionRows(utilRows);
  let raw: number;
  if (!base) raw = armorItemCombatPower(a.baseItemId) + enhance + utilPower;
  else {
    const opt = armorOptionHpDefBonus(a.options, base.hp, base.def);
    raw = armorItemCombatPower(a.baseItemId) + hpDefToArmorCombatPower(opt.hp, opt.def) + enhance + utilPower;
  }
  return Math.floor(raw * equipmentInstanceStatMultiplier(a.quality ?? 0, a.itemLevel ?? 10));
}

export function armorGradeLabel(a: ArmorTooltipData): string {
  return a.gradeLabel ?? itemGradeLabel(a.grade ?? 1);
}

export function armorGradeIndex(a: ArmorTooltipData): number {
  return clampItemGrade(a.grade ?? 1);
}
