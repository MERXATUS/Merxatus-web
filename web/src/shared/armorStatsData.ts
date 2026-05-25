import armorStatsJson from "../../data/armor_stats.json";

export type ArmorStatRow = {
  name: string;
  slot: string;
  grade: number;
  hp: number;
  def: number;
  icon?: string;
};

export const ARMOR_STATS_BY_ID: Record<string, ArmorStatRow> = armorStatsJson as Record<string, ArmorStatRow>;

export function getArmorStats(itemId: string): ArmorStatRow | null {
  return ARMOR_STATS_BY_ID[itemId.trim()] ?? null;
}

/** 방어구 1개당 전투력 환산 (표시·던전 CP용) */
export function armorItemCombatPower(itemId: string): number {
  const s = getArmorStats(itemId);
  if (!s) return 0;
  return Math.max(0, Math.floor(s.hp * 0.2 + s.def * 2));
}
