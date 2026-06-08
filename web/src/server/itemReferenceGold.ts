/**
 * 고정 시세가 없을 때 쓰는 **기준 단가(G)**. 돌(item_stone) = 10G를 앵커로,
 * 마을 시설 드랍 minTier(1~5)에 맞춰 재료는 지수 스케일, 무기·도구 등은 별도 러프 가격.
 */
export const STONE_REFERENCE_GOLD_PER_UNIT = 10;

import { defaultItemGradeForItemId } from "@/server/itemGrade";

export const RARITY_REFERENCE_GROWTH = 1.75;

function rarityReferenceGoldForGrade(grade: number) {
  const g = Math.max(1, Math.min(8, Math.floor(Number(grade) || 1)));
  return Math.max(1, Math.round(STONE_REFERENCE_GOLD_PER_UNIT * RARITY_REFERENCE_GROWTH ** (g - 1)));
}

const T1 = rarityReferenceGoldForGrade(1); // 10
const T2 = rarityReferenceGoldForGrade(2); // 18
const T3 = rarityReferenceGoldForGrade(3); // 31
const T4 = rarityReferenceGoldForGrade(4); // 54
const T5 = rarityReferenceGoldForGrade(5); // 94

/** items.json 전체 + 폴백에 쓰는 기준가 */
const REFERENCE_GOLD_BY_ITEM_ID: Record<string, number> = {
  // --- 광산·제련 재료 (Merxatus) ---
  item_dark_iron_ore: T2,
  item_red_gold_ore: T3,
  item_gold_ore: T4,
  item_dark_iron: 20,
  item_red_gold: 38,
  item_gold: 65,

  // --- 광산 (돌 앵커, 광석은 동티어에서 약간 프리미엄) ---
  item_stone: T1,
  item_ore: 12,
  item_magic_stone_low: T2,
  item_mithril: T3,
  item_magic_stone_mid: T3,
  item_titanium: T4,
  item_magic_stone_high: T4,
  item_ethernium: T5,
  item_magic_stone_top: T5,

  // --- 산(약초) ---
  item_weed: T1,
  item_poppy: T1,
  item_herb: T2,
  item_poison_herb: T2,
  item_mandrake: T3,
  item_snow_flower: T4,
  item_immortal_herb: T5,

  // --- 벌목 ---
  item_oak: T1,
  item_maple: T1,
  item_hard_tree: T2,
  item_world_tree_branch: T3,
  item_thunder_tree: T3,
  item_world_tree_root: T4,
  item_magic_tree: T4,
  item_ancient_wood: T5,
  item_dark_wood: T5,

  // --- 전투 루프 소모품 ---
  item_lesser_mana_stone: T1,
  item_mana_stone: T3,
  item_greater_mana_stone: T5,
  item_enhance_scroll_protect: T4,
  item_appraisal_scroll: T2,
  item_gem_destruction: T4,
  item_gem_chaos: T5,
  item_gem_seal: T5,
  item_raid_shard: T4,
  item_minion_ticket: T5,

  // --- 던전/제작 재료 ---
  item_wood: T1,
  item_mushroom: T1,
  item_iron: 25,
  item_diamond: T4,
  item_magic_stone: T3,
  item_goblin_bag: T4,

  // --- 음식 ---
  item_bread: 8,
  item_stew: 15,

  // --- 무기 (동일 등급대 비슷한 수준) ---
  item_sword: 100,
  item_wood_sword: 85,
  item_iron_sword: 220,
  item_mithril_sword: 520,
  item_titanium_sword: 1100,
  item_ether_sword: 2200,

  item_wood_bow: 85,
  item_steel_bow: 220,
  item_mithril_bow: 520,
  item_titanium_bow: 1100,
  item_ether_bow: 2200,

  item_wood_staff: 85,
  item_magic_staff: 220,
  item_mithril_staff: 520,
  item_titanium_staff: 1100,
  item_ether_staff: 2200,

  // --- 기타 ---
  item_accessory: 55,
};

export function referenceGoldPerUnit(itemId: string): number {
  const v = REFERENCE_GOLD_BY_ITEM_ID[itemId];
  if (typeof v === "number" && v > 0) return v;
  const g = defaultItemGradeForItemId(itemId);
  return rarityReferenceGoldForGrade(g);
}
