import armorOptionTiers from "../../data/armor_option_tiers.json";
import weaponOptionTiers from "../../data/weapon_option_tiers.json";
import { isMechanizedWeaponOptionId } from "@/shared/equipmentCombatModifiers";
import {
  isVoidOptionId,
  voidOptionDisplayName,
  voidOptionTierValue,
} from "@/shared/equipmentVoidOptions";

export type OptionTierRow = {
  name: string;
  tiers: number[];
};

export const WEAPON_OPTION_CATALOG = weaponOptionTiers as Record<string, OptionTierRow>;
export const ARMOR_OPTION_CATALOG = armorOptionTiers as Record<string, OptionTierRow>;

/** 구 제작 옵션 kind → CSV OptionId */
export const LEGACY_WEAPON_OPTION_ID: Record<string, string> = {
  ATTACK: "PHY_ATK_ADD",
  MAGIC_POWER: "MAG_ATK_ADD",
  ATTACK_SPEED: "ATK_SPD_PCT",
  CRITICAL: "FINAL_DMG_PCT",
};

export const LEGACY_OPTION_LABEL_KO: Record<string, string> = {
  ATTACK: "공격력",
  MAGIC_POWER: "마법력",
  ATTACK_SPEED: "공격속도",
  CRITICAL: "크리티컬",
  WORK_SPEED: "작업 속도",
  RARITY_BONUS: "희귀도",
  FATIGUE_REDUCTION: "피로도 감소",
};

export function normalizeOptionId(raw: string): string {
  const id = String(raw ?? "").trim();
  if (!id) return id;
  return LEGACY_WEAPON_OPTION_ID[id] ?? id;
}

export function weaponOptionIds(): string[] {
  return Object.keys(WEAPON_OPTION_CATALOG);
}

export function armorOptionIds(): string[] {
  return Object.keys(ARMOR_OPTION_CATALOG);
}

export function optionCatalogForPool(pool: "weapon" | "armor"): Record<string, OptionTierRow> {
  if (pool === "armor") return ARMOR_OPTION_CATALOG;
  return WEAPON_OPTION_CATALOG;
}

export function optionTierValue(
  catalog: Record<string, OptionTierRow>,
  optionId: string,
  tier: number,
): number {
  const id = normalizeOptionId(optionId);
  const row = catalog[id];
  if (!row?.tiers?.length) return legacyTierDisplayValue(optionId, tier);
  const idx = Math.max(1, Math.min(9, Math.floor(tier))) - 1;
  const v = row.tiers[idx];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function optionDisplayName(optionId: string, pool: "weapon" | "armor"): string {
  const id = normalizeOptionId(optionId);
  if (isVoidOptionId(id)) return voidOptionDisplayName(id);
  const catalog = optionCatalogForPool(pool);
  return catalog[id]?.name ?? LEGACY_OPTION_LABEL_KO[optionId] ?? LEGACY_OPTION_LABEL_KO[id] ?? id;
}

/** 레거시 kind 전용 표시값 */
function legacyTierDisplayValue(kind: string, tier: number): number {
  const t = Math.max(1, Math.min(9, Math.floor(tier)));
  const base = 3 + t * 2;
  if (kind === "CRITICAL" || kind === "RARITY_BONUS") return Math.min(99, 5 + t * 4);
  if (kind === "FATIGUE_REDUCTION") return Math.min(99, 4 + t * 3);
  if (kind === "WORK_SPEED") return base;
  return base;
}

export function formatOptionValueForDisplay(optionId: string, tier: number, pool: "weapon" | "armor"): number {
  const id = normalizeOptionId(optionId);
  if (isVoidOptionId(id)) return voidOptionTierValue(id, tier);
  const catalog = optionCatalogForPool(pool);
  const v = optionTierValue(catalog, optionId, tier);
  if (v !== 0 || catalog[id]) return v;
  return legacyTierDisplayValue(optionId, tier);
}

const STAT_OPTION_IDS = new Set(["STAT_STR_ADD", "STAT_DEX_ADD", "STAT_INT_ADD", "STAT_END_ADD"]);

export function isStatOptionId(optionId: string): boolean {
  return STAT_OPTION_IDS.has(normalizeOptionId(optionId));
}

export type EquipmentStatBonus = {
  strength: number;
  agility: number;
  intelligence: number;
  endurance: number;
};

export function statBonusFromOptionRows(
  rows: Array<{ optionId: string; tier: number }>,
  pool: "weapon" | "armor",
): EquipmentStatBonus {
  const catalog = optionCatalogForPool(pool);
  const out = { strength: 0, agility: 0, intelligence: 0, endurance: 0 };
  for (const row of rows) {
    const id = normalizeOptionId(row.optionId);
    const v = optionTierValue(catalog, id, row.tier);
    if (id === "STAT_STR_ADD") out.strength += v;
    else if (id === "STAT_DEX_ADD") out.agility += v;
    else if (id === "STAT_INT_ADD") out.intelligence += v;
    else if (id === "STAT_END_ADD") out.endurance += v;
  }
  return out;
}

const FLAT_ATK_OPTION_IDS = new Set(["PHY_ATK_ADD", "MAG_ATK_ADD"]);
const PCT_ATK_OPTION_IDS = new Set(["PHY_ATK_PCT", "MAG_ATK_PCT", "FINAL_DMG_PCT"]);

/**
 * % 옵션 → CP 환산 (표시값 1당). 깡스탯만 유지.
 */
export const UTIL_OPTION_CP_PER_DISPLAY_UNIT: Record<string, number> = {
  ATK_SPD_PCT: 0.12,
  FINAL_DMG_PCT: 0.14,
};

export function utilOptionPowerFromDisplayValue(optionId: string, displayValue: number): number {
  const id = normalizeOptionId(optionId);
  const weight = UTIL_OPTION_CP_PER_DISPLAY_UNIT[id];
  if (!weight || displayValue <= 0) return 0;
  return displayValue * weight;
}

export function armorUtilPowerBonusFromOptionRows(rows: Array<{ optionId: string; tier: number }>): number {
  let sum = 0;
  for (const row of rows) {
    const id = normalizeOptionId(row.optionId);
    const v = optionTierValue(ARMOR_OPTION_CATALOG, id, row.tier);
    if (v <= 0) continue;
    if (id === "FINAL_DMG_PCT") sum += utilOptionPowerFromDisplayValue(id, v);
  }
  return Math.round(sum * 100) / 100;
}

export function weaponPowerBonusFromOptionRows(rows: Array<{ optionId: string; tier: number }>): number {
  let sum = 0;
  for (const row of rows) {
    const id = normalizeOptionId(row.optionId);
    const v = optionTierValue(WEAPON_OPTION_CATALOG, id, row.tier);
    if (v <= 0) continue;
    if (isMechanizedWeaponOptionId(id)) {
      sum += utilOptionPowerFromDisplayValue(id, v);
      continue;
    }
    if (FLAT_ATK_OPTION_IDS.has(id)) sum += v * 0.1;
    else if (PCT_ATK_OPTION_IDS.has(id)) sum += v * 0.4;
    else if (LEGACY_OPTION_LABEL_KO[id]) sum += v;
  }
  return Math.round(sum * 100) / 100;
}

export function armorHpDefBonusFromOptionRows(rows: Array<{ optionId: string; tier: number }>, baseHp: number, baseDef: number) {
  let hp = 0;
  let def = 0;
  let hpPct = 0;
  let defPct = 0;
  for (const row of rows) {
    const id = normalizeOptionId(row.optionId);
    const v = optionTierValue(ARMOR_OPTION_CATALOG, id, row.tier);
    if (id === "HP_ADD") hp += v;
    else if (id === "DEF_ADD") def += v;
    else if (id === "HP_PCT") hpPct += v;
    else if (id === "DEF_PCT") defPct += v;
  }
  hp += Math.floor(baseHp * (hpPct / 100));
  def += Math.floor(baseDef * (defPct / 100));
  return { hp, def };
}
