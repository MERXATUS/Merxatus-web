import armorStatsJson from "../../data/armor_stats.json";
import { normalizeItemId, normalizeItemIdLower } from "@/shared/itemId";
import type { EquipmentStatBonus } from "@/shared/itemOptionCatalog";
import { MINION_STAT_KEYS, MINION_STAT_LABELS } from "@/shared/minionBaseStats";

export type ArmorStatRow = {
  name: string;
  slot: string;
  grade: number;
  hp: number;
  def: number;
  str?: number;
  dex?: number;
  int?: number;
  end?: number;
  icon?: string;
};

export const ARMOR_STATS_BY_ID: Record<string, ArmorStatRow> = armorStatsJson as Record<string, ArmorStatRow>;

export function getArmorStats(itemId: string): ArmorStatRow | null {
  const id = normalizeItemId(itemId);
  if (!id) return null;
  return ARMOR_STATS_BY_ID[id] ?? null;
}

/** HP·DEF → 방어구 전투력 환산 (베이스·강화·옵션 공통) */
export function hpDefToArmorCombatPower(hp: number, def: number): number {
  return Math.max(0, Math.floor(hp * 0.2 + def * 2));
}

/** 방어구 1개당 전투력 환산 (표시·던전 CP용) */
export function armorItemCombatPower(itemId: string): number {
  const s = getArmorStats(itemId);
  if (!s) return 0;
  return hpDefToArmorCombatPower(s.hp, s.def);
}

export function armorStatBonuses(row: ArmorStatRow): EquipmentStatBonus {
  const g = Math.max(1, Math.floor(row.grade));
  let defaults: EquipmentStatBonus;
  switch (row.slot.trim()) {
    case "Helmet":
      defaults = { strength: 0, agility: 0, intelligence: 0, endurance: g };
      break;
    case "Armor":
      defaults = { strength: 0, agility: 0, intelligence: 0, endurance: g * 2 };
      break;
    case "Pants":
    case "Boots":
      defaults = { strength: 0, agility: g, intelligence: 0, endurance: 0 };
      break;
    default:
      defaults = { strength: 0, agility: 0, intelligence: 0, endurance: 0 };
  }
  return {
    strength: row.str ?? defaults.strength,
    agility: row.dex ?? defaults.agility,
    intelligence: row.int ?? defaults.intelligence,
    endurance: row.end ?? defaults.endurance,
  };
}

function formatStatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
}

export function isArmorInventoryItem(it: { itemId: unknown; category: string }): boolean {
  const id = normalizeItemIdLower(it.itemId);
  return it.category === "방어구" || id.startsWith("armor_");
}

export function armorSlotLabelKo(slot: string): string {
  switch (slot.trim()) {
    case "Helmet":
      return "투구";
    case "Armor":
      return "갑옷";
    case "Pants":
      return "하의";
    case "Boots":
      return "신발";
    default:
      return slot;
  }
}

/** 인벤·툴팁용 한 줄 */
export function armorBaseStatLine(itemId: string): string | null {
  const s = getArmorStats(itemId);
  if (!s) return null;
  const stats = armorStatBonuses(s);
  const parts: string[] = [];
  if (s.hp > 0) parts.push(`HP ${formatStatValue(s.hp)}`);
  if (s.def > 0) parts.push(`DEF ${formatStatValue(s.def)}`);
  for (const key of MINION_STAT_KEYS) {
    if (stats[key] > 0) parts.push(`${MINION_STAT_LABELS[key]} ${stats[key]}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
