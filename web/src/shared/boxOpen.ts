import { normalizeItemIdLower } from "@/shared/itemId";

/** 전투 드랍 상자 (개봉 가능) */
export function isLootBoxItemId(itemId: unknown): boolean {
  const id = normalizeItemIdLower(itemId);
  if (!id) return false;
  return /^item_box_(mineral|herb|gear)_t[1-6]$/.test(id);
}

/** 상자 1개 개봉 시 가중치 롤 횟수 */
export function lootBoxRollCount(boxItemId: unknown): number {
  const id = normalizeItemIdLower(boxItemId);
  if (!id) return 2;
  if (/^item_box_gear_t[1-6]$/.test(id)) return 1;
  const m = /_t(\d)$/i.exec(id);
  const tier = m ? Math.max(1, Math.min(5, parseInt(m[1] ?? "1", 10))) : 1;
  if (tier >= 5) return 4;
  if (tier >= 3) return 3;
  return 2;
}
