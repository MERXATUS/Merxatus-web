import { ITEM_ENHANCE_SCROLL_PROTECT } from "@/shared/enhanceConsumables";
import {
  ITEM_APPRAISAL_SCROLL,
  ITEM_GEM_CHAOS,
  ITEM_GEM_DESTRUCTION,
  ITEM_GEM_SEAL,
  ITEM_TOME_ABYSS,
  ITEM_TOME_CELESTIAL,
  OPTION_CONSUMABLE_ITEM_IDS,
} from "@/shared/optionConsumables";
import { stageOrderForDungeonId } from "@/shared/dungeonStageProgression";

/** 강화소·장비 가공용 소모품 (스택 아이템) */
export const CRAFTING_CONSUMABLE_ITEM_IDS = [
  "item_lesser_mana_stone",
  "item_mana_stone",
  "item_greater_mana_stone",
  ITEM_ENHANCE_SCROLL_PROTECT,
  ...OPTION_CONSUMABLE_ITEM_IDS,
] as const;

const CRAFTING_ID_SET = new Set<string>(CRAFTING_CONSUMABLE_ITEM_IDS);

/** `items.json` grade — 콘텐츠 티어보다 높은 등급 아이템은 드랍 풀에서 제외 */
export const CRAFTING_ITEM_GRADE: Record<string, number> = {
  item_lesser_mana_stone: 1,
  item_appraisal_scroll: 2,
  item_mana_stone: 3,
  item_enhance_scroll_protect: 4,
  item_gem_destruction: 4,
  item_greater_mana_stone: 5,
  item_gem_chaos: 5,
  item_gem_seal: 5,
  item_gem_expansion: 5,
  item_tome_celestial: 6,
  item_tome_abyss: 6,
  item_gem_ascension: 6,
  item_gem_primordial: 6,
  item_gem_void: 7,
  item_gem_transfer: 7,
  item_gem_blessing: 7,
};

export type LootDropRow = {
  itemId: string;
  weight: number;
  minQty: number;
  maxQty: number;
  minFloor?: number;
  maxFloor?: number;
};

export type CraftingDropContext = {
  /** 1~8 — 던전 스테이지·레이드·무탑 구간과 동일 스케일 */
  tier: number;
  boss?: boolean;
  maxFloors?: number;
};

export function isCraftingConsumableItemId(itemId: string): boolean {
  return CRAFTING_ID_SET.has(itemId.trim().toLowerCase());
}

export function stripCraftingConsumablesFromDrops(drops: LootDropRow[]): LootDropRow[] {
  return drops.filter((d) => !isCraftingConsumableItemId(d.itemId));
}

/** 콘텐츠 티어당 허용 최대 아이템 등급 */
export function maxCraftingGradeForTier(tier: number): number {
  const t = Math.max(1, Math.min(8, Math.floor(tier)));
  if (t <= 2) return 2;
  if (t <= 4) return 4;
  if (t <= 6) return 5;
  return 6;
}

function floorGateForGrade(
  grade: number,
  maxFloors: number,
  boss: boolean,
): Pick<LootDropRow, "minFloor" | "maxFloor"> {
  if (boss) return {};
  const mf = Math.max(1, Math.floor(maxFloors));
  if (grade >= 5) return { minFloor: Math.max(1, Math.ceil(mf * 0.5)) };
  if (grade >= 4) return { minFloor: Math.max(1, Math.ceil(mf * 0.35)) };
  if (grade >= 3) return { minFloor: Math.max(1, Math.ceil(mf * 0.2)) };
  return {};
}

type WeightRow = { itemId: string; grade: number; weight: number; minQty: number; maxQty: number };

function weightTableForTier(tier: number): WeightRow[] {
  const t = Math.max(1, Math.min(8, Math.floor(tier)));
  const rows: WeightRow[] = [];

  const push = (itemId: string, grade: number, weight: number, minQty: number, maxQty: number) => {
    if (weight > 0) rows.push({ itemId, grade, weight, minQty, maxQty });
  };

  push("item_lesser_mana_stone", 1, t <= 2 ? 3200 : t <= 4 ? 1400 : t <= 6 ? 500 : 0, 1, 2);
  push("item_appraisal_scroll", 2, t <= 2 ? 2400 : t <= 4 ? 2800 : t <= 6 ? 2400 : 2000, 1, 2);
  push("item_mana_stone", 3, t <= 2 ? 0 : t <= 4 ? 2300 : t <= 6 ? 2500 : 1000, 1, 2);
  push("item_enhance_scroll_protect", 4, t <= 3 ? 0 : t <= 4 ? 500 : t <= 6 ? 850 : 1100, 1, 1);
  push("item_gem_destruction", 4, t <= 3 ? 0 : t <= 4 ? 600 : t <= 6 ? 900 : 850, 1, 1);
  push("item_greater_mana_stone", 5, t <= 4 ? 0 : t <= 6 ? 2100 : 3200, 1, 2);
  push("item_gem_chaos", 5, t <= 5 ? 0 : t <= 6 ? 520 : 1150, 1, 1);
  push("item_gem_seal", 5, t <= 5 ? 0 : t <= 6 ? 220 : 480, 1, 1);
  push(ITEM_TOME_CELESTIAL, 6, t <= 6 ? 0 : t <= 7 ? 180 : 320, 1, 1);
  push(ITEM_TOME_ABYSS, 6, t <= 6 ? 0 : t <= 7 ? 180 : 320, 1, 1);
  push("item_gem_expansion", 5, t <= 5 ? 0 : t <= 6 ? 380 : 720, 1, 1);
  push("item_gem_ascension", 6, t <= 6 ? 0 : t <= 7 ? 140 : 260, 1, 1);
  push("item_gem_primordial", 6, t <= 6 ? 0 : t <= 7 ? 120 : 220, 1, 1);
  push("item_gem_void", 7, t <= 7 ? 0 : 160, 1, 1);
  push("item_gem_transfer", 7, t <= 7 ? 0 : 140, 1, 1);
  push("item_gem_blessing", 7, t <= 7 ? 0 : 180, 1, 1);

  return rows;
}

/** 티어·보스 여부에 맞는 크래프팅 드랍 행 생성 */
export function craftingDropRowsForContext(ctx: CraftingDropContext): LootDropRow[] {
  const tier = Math.max(1, Math.min(8, Math.floor(ctx.tier)));
  const maxGrade = maxCraftingGradeForTier(tier);
  const boss = !!ctx.boss;
  const maxFloors = Math.max(1, ctx.maxFloors ?? 20);
  const out: LootDropRow[] = [];

  for (const row of weightTableForTier(tier)) {
    if (row.grade > maxGrade) continue;
    const weight = Math.round(row.weight * (boss && row.grade >= 4 ? 1.3 : 1));
    if (weight <= 0) continue;
    out.push({
      itemId: row.itemId,
      weight,
      minQty: row.minQty,
      maxQty: row.maxQty + (boss ? 1 : 0),
      ...floorGateForGrade(row.grade, maxFloors, boss),
    });
  }

  return out;
}

export function mergeCraftingDropPool(baseDrops: LootDropRow[], ctx: CraftingDropContext): LootDropRow[] {
  const base = stripCraftingConsumablesFromDrops(baseDrops);
  const crafting = craftingDropRowsForContext(ctx);
  if (!crafting.length) return base;
  return [...base, ...crafting];
}

export function contentTierForDungeonId(dungeonId: string): number {
  return stageOrderForDungeonId(dungeonId) ?? 1;
}

export const RAID_CONTENT_TIER: Record<string, number> = {
  raid_monster_slime: 1,
  raid_monster_goblin: 2,
  raid_monster_wolf: 3,
  raid_boss_slime_king: 2,
  raid_boss_goblin_chieftain: 3,
  raid_boss_wolf_alpha: 4,
  raid_boss_demon_barbatos: 3,
  raid_boss_demon_lerajie: 3,
  raid_boss_demon_eligos: 4,
  raid_boss_demon_naberius: 4,
  raid_boss_demon_glasya: 4,
  raid_boss_demon_bune: 5,
  raid_boss_demon_ronove: 5,
  raid_boss_demon_baal: 5,
  raid_boss_demon_agares: 5,
  raid_boss_demon_paimon: 5,
  raid_boss_demon_astaroth: 6,
  raid_boss_demon_asmodeus: 6,
  raid_boss_demon_belial: 6,
  raid_boss_demon_vassago: 6,
  raid_monster_skeleton: 4,
  raid_monster_fire_salamander: 5,
  raid_monster_ice_wisp: 5,
  raid_boss_skeleton_lord: 5,
  raid_boss_flame_tyrant: 6,
  raid_boss_frost_titan: 6,
  raid_boss_angel_cassiel: 3,
  raid_boss_angel_sachiel: 3,
  raid_boss_angel_anael: 4,
  raid_boss_angel_raphael: 4,
  raid_boss_angel_gabriel: 4,
  raid_boss_angel_michael: 5,
  raid_boss_angel_uriel: 5,
  raid_boss_angel_metatron: 6,
  raid_boss_angel_raziel: 6,
  raid_boss_angel_zadkiel: 6,
  raid_boss_angel_camael: 6,
  raid_boss_angel_haniel: 6,
  raid_boss_angel_zophiel: 6,
  raid_boss_angel_raguel: 7,
  raid_boss_elder_dragon: 7,
  raid_boss_void_harbinger: 8,
  raid_boss_void_overlord: 8,
};

export function contentTierForRaidId(raidId: string): number {
  return RAID_CONTENT_TIER[raidId.trim().toLowerCase()] ?? 5;
}

/** 무탑 1~80층 → 티어 1~8 (10층 단위) */
export function towerContentTierFromFloor(floor: number): number {
  const f = Math.max(1, Math.floor(floor));
  return Math.max(1, Math.min(8, Math.ceil(f / 10)));
}

/** 무탑: 티어별 10층 구간에 크래프팅 풀 부여 */
export function craftingDropRowsForTower(): LootDropRow[] {
  const out: LootDropRow[] = [];
  for (let tier = 1; tier <= 8; tier++) {
    const minFloor = (tier - 1) * 10 + 1;
    const maxFloor = tier * 10;
    for (const row of craftingDropRowsForContext({ tier, maxFloors: 80 })) {
      out.push({ ...row, minFloor, maxFloor });
    }
  }
  return out;
}

export function mergeCraftingIntoTowerDrops(drops: LootDropRow[]): LootDropRow[] {
  const base = stripCraftingConsumablesFromDrops(drops);
  return [...base, ...craftingDropRowsForTower()];
}
