import { armorStatBonuses, getArmorStats } from "@/shared/armorStatsData";
import {
  formatOptionValueForDisplay,
  normalizeOptionId,
  type EquipmentStatBonus,
} from "@/shared/itemOptionCatalog";
import { MINION_STAT_KEYS, type MinionStatKey } from "@/shared/minionBaseStats";
import { getWeaponStats, weaponStatBonuses } from "@/shared/weaponStatsData";

export type EquipmentItemBaseStats = {
  atk: number;
  magic: number;
  hp: number;
  def: number;
} & EquipmentStatBonus;

export type EquipmentBaseStatsView = Partial<
  Record<"atk" | "magic" | "hp" | "def" | MinionStatKey, number>
>;

export function weaponItemBaseStats(itemId: string): EquipmentItemBaseStats | null {
  const row = getWeaponStats(itemId);
  if (!row) return null;
  const stats = weaponStatBonuses(row);
  return { atk: row.atk, magic: row.magic, hp: 0, def: 0, ...stats };
}

export function armorItemBaseStats(itemId: string): EquipmentItemBaseStats | null {
  const row = getArmorStats(itemId);
  if (!row) return null;
  const stats = armorStatBonuses(row);
  return { atk: 0, magic: 0, hp: row.hp, def: row.def, ...stats };
}

export function equipmentBaseStatsView(
  itemId: string,
  category: "weapon" | "armor",
): EquipmentBaseStatsView | null {
  const bases = category === "weapon" ? weaponItemBaseStats(itemId) : armorItemBaseStats(itemId);
  if (!bases) return null;
  const out: EquipmentBaseStatsView = {};
  if (bases.atk > 0) out.atk = bases.atk;
  if (bases.magic > 0) out.magic = bases.magic;
  if (bases.hp > 0) out.hp = bases.hp;
  if (bases.def > 0) out.def = bases.def;
  for (const key of MINION_STAT_KEYS) {
    if (bases[key] > 0) out[key] = bases[key];
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function isPercentOptionId(optionId: string): boolean {
  const id = normalizeOptionId(optionId);
  if (id.endsWith("_PCT")) return true;
  return id === "CRITICAL" || id === "ATTACK_SPEED";
}

/** 아이템 베이스 스탯에 연동되는 % 옵션 (HP/DEF/ATK/MAG) */
export function isBaseLinkedPercentOption(optionId: string): boolean {
  const id = normalizeOptionId(optionId);
  return id === "PHY_ATK_PCT" || id === "MAG_ATK_PCT" || id === "HP_PCT" || id === "DEF_PCT";
}

export function optionPctBaseValue(optionId: string, bases: EquipmentItemBaseStats): number | null {
  const id = normalizeOptionId(optionId);
  if (id === "PHY_ATK_PCT") return bases.atk;
  if (id === "MAG_ATK_PCT") return bases.magic;
  if (id === "HP_PCT") return bases.hp;
  if (id === "DEF_PCT") return bases.def;
  return null;
}

/** 방어구 HP/DEF %와 동일 — `floor(base × pct / 100)` */
export function pctOptionFlatBonus(base: number, pct: number): number {
  if (base <= 0 || pct <= 0) return 0;
  return Math.floor(base * (pct / 100));
}

export function enrichOptionDisplayFields(input: {
  optionId: string;
  tier: number;
  pool: "weapon" | "armor";
  baseItemId?: string;
}): { displayValue: number; isPercent: boolean; flatBonus?: number } {
  const optionId = normalizeOptionId(input.optionId);
  const displayValue = formatOptionValueForDisplay(optionId, input.tier, input.pool);
  const isPercent = isPercentOptionId(optionId);
  if (!isBaseLinkedPercentOption(optionId) || !input.baseItemId) {
    return { displayValue, isPercent };
  }
  const bases =
    input.pool === "weapon"
      ? weaponItemBaseStats(input.baseItemId)
      : armorItemBaseStats(input.baseItemId);
  if (!bases) return { displayValue, isPercent };
  const baseForPct = optionPctBaseValue(optionId, bases);
  if (baseForPct == null) return { displayValue, isPercent };
  const flatBonus = pctOptionFlatBonus(baseForPct, displayValue);
  return { displayValue, isPercent, flatBonus };
}

export function formatOptionValueText(input: {
  displayValue: number;
  isPercent?: boolean;
  flatBonus?: number;
}): string {
  const sign = input.displayValue >= 0 ? "+" : "";
  if (input.isPercent) {
    const suffix =
      input.flatBonus != null && input.flatBonus > 0 ? ` (+${input.flatBonus})` : "";
    return `${sign}${input.displayValue}%${suffix}`;
  }
  return `${sign}${input.displayValue}`;
}
