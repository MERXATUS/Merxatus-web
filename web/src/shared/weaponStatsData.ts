import weaponStatsJson from "../../data/weapon_stats.json";
import { combatPowerFromEquipmentStats } from "@/shared/equipmentCombatPower";
import { normalizeItemId } from "@/shared/itemId";
import type { EquipmentStatBonus } from "@/shared/itemOptionCatalog";
import { MINION_STAT_KEYS, MINION_STAT_LABELS } from "@/shared/minionBaseStats";

export type WeaponStatRow = {
  name: string;
  grade: number;
  atk: number;
  magic: number;
  /** 힘 — 미지정 시 등급·무기 유형 기본값 */
  str?: number;
  /** 민첩 */
  dex?: number;
  /** 지능 */
  int?: number;
  /** 인내 */
  end?: number;
  icon?: string;
};

export const WEAPON_STATS_BY_ID: Record<string, WeaponStatRow> = weaponStatsJson as Record<
  string,
  WeaponStatRow
>;

export function getWeaponStats(itemId: unknown): WeaponStatRow | null {
  const id = normalizeItemId(itemId);
  if (!id) return null;
  return WEAPON_STATS_BY_ID[id] ?? null;
}

/** 무기 베이스 ATK·Magic·4스탯 가중합 → CP */
export function weaponCombatPowerFromRow(row: WeaponStatRow): number {
  const stats = weaponStatBonuses(row);
  return combatPowerFromEquipmentStats({
    atk: row.atk,
    magic: row.magic,
    ...stats,
  });
}

export function weaponCombatPowerFromStats(itemId: string): number {
  const s = getWeaponStats(itemId);
  if (!s) return 0;
  return weaponCombatPowerFromRow(s);
}

export function weaponStatBonuses(row: WeaponStatRow): EquipmentStatBonus {
  const g = Math.max(1, Math.floor(row.grade));
  let defaults: EquipmentStatBonus;
  if (row.magic > row.atk) {
    defaults = { strength: 0, agility: 0, intelligence: g, endurance: 0 };
  } else if (row.magic > 0) {
    const half = Math.ceil(g / 2);
    defaults = { strength: half, agility: 0, intelligence: half, endurance: 0 };
  } else {
    defaults = { strength: g, agility: 0, intelligence: 0, endurance: 0 };
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

/** 인벤·툴팁용 한 줄 */
export function weaponBaseStatLine(itemId: string): string | null {
  const s = getWeaponStats(itemId);
  if (!s) return null;
  const stats = weaponStatBonuses(s);
  const parts: string[] = [];
  if (s.atk > 0) parts.push(`공격력 ${formatStatValue(s.atk)}`);
  if (s.magic > 0) parts.push(`마력 ${formatStatValue(s.magic)}`);
  for (const key of MINION_STAT_KEYS) {
    if (stats[key] > 0) parts.push(`${MINION_STAT_LABELS[key]} ${stats[key]}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
