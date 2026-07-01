/** 상점 뽑기 — 풀 정의·비용·롤 로직 (클라이언트 표시 + 서버 검증 공유) */

export type GachaEntryKind = "gold" | "item" | "equipment";

export type GachaPoolEntryDef =
  | { kind: "gold"; weight: number; minGold: number; maxGold: number }
  | { kind: "item"; itemId: string; weight: number; minQty: number; maxQty: number }
  | { kind: "equipment"; itemId: string; weight: number };

export type GachaPoolDef = {
  id: string;
  name: string;
  description: string;
  singleCostGold: number;
  multiCount: number;
  multiCostGold: number;
  /** 10연차 시 장비 1개 이상 보장 (장비 풀 전용) */
  multiGuaranteeEquipment: boolean;
  entries: GachaPoolEntryDef[];
};

export type GachaRoll =
  | { kind: "gold"; gold: number }
  | { kind: "item"; itemId: string; qty: number }
  | { kind: "equipment"; itemId: string; qty: 1 };

export const GACHA_EQUIPMENT_POOL_ID = "equipment";
export const GACHA_MATERIALS_POOL_ID = "materials";

/** @deprecated 레거시 ID — equipment 풀로 매핑 */
export const GACHA_STANDARD_POOL_ID = GACHA_EQUIPMENT_POOL_ID;

export const GACHA_EQUIPMENT_POOL: GachaPoolDef = {
  id: GACHA_EQUIPMENT_POOL_ID,
  name: "장비 상자",
  description: "무기·방어구를 골드로 뽑습니다. 입문용 장비를 빠르게 확보하세요.",
  singleCostGold: 500,
  multiCount: 10,
  multiCostGold: 4_500,
  multiGuaranteeEquipment: true,
  entries: [
    { kind: "equipment", itemId: "weapon_wood_sword", weight: 48 },
    { kind: "equipment", itemId: "weapon_stone_sword", weight: 44 },
    { kind: "equipment", itemId: "weapon_red_gold_sword", weight: 10 },
    { kind: "equipment", itemId: "armor_leather_helmet", weight: 22 },
    { kind: "equipment", itemId: "armor_leather_armor", weight: 22 },
    { kind: "equipment", itemId: "armor_leather_pants", weight: 22 },
    { kind: "equipment", itemId: "armor_leather_boots", weight: 22 },
    { kind: "equipment", itemId: "armor_chain_helmet", weight: 16 },
    { kind: "equipment", itemId: "armor_chain_armor", weight: 16 },
    { kind: "equipment", itemId: "armor_chain_pants", weight: 16 },
    { kind: "equipment", itemId: "armor_chain_boots", weight: 16 },
  ],
};

export const GACHA_MATERIALS_POOL: GachaPoolDef = {
  id: GACHA_MATERIALS_POOL_ID,
  name: "재료 상자",
  description: "강화·가공에 쓰는 재료와 골드를 뽑습니다.",
  singleCostGold: 400,
  multiCount: 10,
  multiCostGold: 3_600,
  multiGuaranteeEquipment: false,
  entries: [
    { kind: "gold", weight: 90, minGold: 60, maxGold: 140 },
    { kind: "gold", weight: 40, minGold: 140, maxGold: 280 },
    { kind: "gold", weight: 12, minGold: 280, maxGold: 520 },
    { kind: "item", itemId: "item_lesser_mana_stone", weight: 130, minQty: 1, maxQty: 3 },
    { kind: "item", itemId: "item_appraisal_scroll", weight: 95, minQty: 1, maxQty: 2 },
    { kind: "item", itemId: "item_mana_stone", weight: 42, minQty: 1, maxQty: 1 },
    { kind: "item", itemId: "item_enhance_scroll_protect", weight: 14, minQty: 1, maxQty: 1 },
  ],
};

const GACHA_POOLS: Record<string, GachaPoolDef> = {
  [GACHA_EQUIPMENT_POOL_ID]: GACHA_EQUIPMENT_POOL,
  [GACHA_MATERIALS_POOL_ID]: GACHA_MATERIALS_POOL,
  /** 레거시 API poolId */
  standard: GACHA_EQUIPMENT_POOL,
};

export function getGachaPool(poolId: string): GachaPoolDef | null {
  return GACHA_POOLS[poolId.trim()] ?? null;
}

export function listGachaPools(): GachaPoolDef[] {
  return [GACHA_EQUIPMENT_POOL, GACHA_MATERIALS_POOL];
}

function pickWeightedIndex(weights: number[], rnd = Math.random): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return -1;
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

function randIntInclusive(min: number, max: number, rnd = Math.random): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

function rollEntry(entry: GachaPoolEntryDef, rnd = Math.random): GachaRoll {
  if (entry.kind === "gold") {
    return { kind: "gold", gold: randIntInclusive(entry.minGold, entry.maxGold, rnd) };
  }
  if (entry.kind === "equipment") {
    return { kind: "equipment", itemId: entry.itemId, qty: 1 };
  }
  return {
    kind: "item",
    itemId: entry.itemId,
    qty: randIntInclusive(entry.minQty, entry.maxQty, rnd),
  };
}

export function rollGacha(pool: GachaPoolDef, rnd = Math.random): GachaRoll {
  const weights = pool.entries.map((e) => e.weight);
  const idx = pickWeightedIndex(weights, rnd);
  if (idx < 0) return { kind: "gold", gold: 80 };
  return rollEntry(pool.entries[idx]!, rnd);
}

export function rollGachaEquipment(pool: GachaPoolDef, rnd = Math.random): GachaRoll {
  const equipEntries = pool.entries.filter((e): e is Extract<GachaPoolEntryDef, { kind: "equipment" }> => e.kind === "equipment");
  if (!equipEntries.length) return rollGacha(pool, rnd);
  const weights = equipEntries.map((e) => e.weight);
  const idx = pickWeightedIndex(weights, rnd);
  if (idx < 0) return { kind: "equipment", itemId: equipEntries[0]!.itemId, qty: 1 };
  return rollEntry(equipEntries[idx]!, rnd);
}

export function rollGachaBatch(pool: GachaPoolDef, count: number, rnd = Math.random): GachaRoll[] {
  const n = Math.max(1, Math.min(10, Math.floor(count)));
  const rolls: GachaRoll[] = [];
  for (let i = 0; i < n; i++) rolls.push(rollGacha(pool, rnd));

  if (n === pool.multiCount && pool.multiGuaranteeEquipment) {
    const hasEquip = rolls.some((r) => r.kind === "equipment");
    if (!hasEquip) rolls[rolls.length - 1] = rollGachaEquipment(pool, rnd);
  }
  return rolls;
}

export function gachaPullCostGold(pool: GachaPoolDef, count: number): number {
  if (count === pool.multiCount) return pool.multiCostGold;
  return pool.singleCostGold;
}
