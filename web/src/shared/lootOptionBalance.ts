import type { ItemGradeIndex } from "@/shared/optionTierBalance";
import { filterOptionIdsForGrade } from "@/shared/optionTierBalance";
import {
  blessingOptionIdsForRealm,
  type OptionRealm,
} from "@/shared/equipmentBlessings";
import { armorOptionIds, weaponOptionIds } from "@/shared/itemOptionCatalog";

function clampItemGrade(g: number): ItemGradeIndex {
  const n = Math.floor(Number(g));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(8, n)) as ItemGradeIndex;
}

/** 전투 드랍 장비 — 아이템 등급별 옵션 슬롯 (최대 6) */
export const LOOT_OPTION_SLOTS_BY_GRADE: Record<ItemGradeIndex, number> = {
  1: 2,
  2: 2,
  3: 2,
  4: 4,
  5: 4,
  6: 4,
  7: 6,
  8: 6,
};

export const LOOT_OPTION_MAX_SLOTS = 6;

export function lootOptionSlotCountForGrade(grade: number): number {
  return LOOT_OPTION_SLOTS_BY_GRADE[clampItemGrade(grade)];
}

export type LootOptionPoolStats = {
  grade: ItemGradeIndex;
  slotCount: number;
  weapon: { celestial: number; abyss: number; catalog: number };
  armor: { celestial: number; abyss: number; catalog: number };
};

export function lootOptionPoolStatsForGrade(grade: number): LootOptionPoolStats {
  const g = clampItemGrade(grade);
  const poolFor = (kind: "weapon" | "armor", realm: OptionRealm) =>
    filterOptionIdsForGrade(blessingOptionIdsForRealm(kind, realm), g, kind).length;

  return {
    grade: g,
    slotCount: lootOptionSlotCountForGrade(g),
    weapon: {
      celestial: poolFor("weapon", "celestial"),
      abyss: poolFor("weapon", "abyss"),
      catalog: weaponOptionIds().length,
    },
    armor: {
      celestial: poolFor("armor", "celestial"),
      abyss: poolFor("armor", "abyss"),
      catalog: armorOptionIds().length,
    },
  };
}

/** 등급 1~8 풀·슬롯 요약 (밸런스 시트·UI 참고) */
export function listLootOptionPoolStats(): LootOptionPoolStats[] {
  return Array.from({ length: 8 }, (_, i) => lootOptionPoolStatsForGrade(i + 1));
}
