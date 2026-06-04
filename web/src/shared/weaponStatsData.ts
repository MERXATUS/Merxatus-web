import weaponStatsJson from "../../data/weapon_stats.json";
import { normalizeItemId } from "@/shared/itemId";

export type WeaponStatRow = {
  name: string;
  grade: number;
  atk: number;
  magic: number;
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

/** CSV `weapons.csv` Atk/Magic → `gameRules.weaponPowerByItemId` 와 동일 공식 */
export function weaponCombatPowerFromStats(itemId: string): number {
  const s = getWeaponStats(itemId);
  if (!s) return 0;
  return Math.max(1, Math.round(s.atk || s.magic || 1));
}

function formatStatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
}

/** 인벤·툴팁용 한 줄 (예: ATK 2.5 · MAG 0) */
export function weaponBaseStatLine(itemId: string): string | null {
  const s = getWeaponStats(itemId);
  if (!s) return null;
  const parts: string[] = [];
  if (s.atk > 0) parts.push(`ATK ${formatStatValue(s.atk)}`);
  if (s.magic > 0) parts.push(`MAG ${formatStatValue(s.magic)}`);
  if (parts.length === 0) parts.push("ATK 0");
  return parts.join(" · ");
}
