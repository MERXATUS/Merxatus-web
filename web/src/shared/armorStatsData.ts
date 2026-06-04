import armorStatsJson from "../../data/armor_stats.json";
import { normalizeItemId, normalizeItemIdLower } from "@/shared/itemId";

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
  const id = normalizeItemId(itemId);
  if (!id) return null;
  return ARMOR_STATS_BY_ID[id] ?? null;
}

/** 방어구 1개당 전투력 환산 (표시·던전 CP용) */
export function armorItemCombatPower(itemId: string): number {
  const s = getArmorStats(itemId);
  if (!s) return 0;
  return Math.max(0, Math.floor(s.hp * 0.2 + s.def * 2));
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
