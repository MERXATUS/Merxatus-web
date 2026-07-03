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
  /** 10연차 시 장비 1개 이상 보장 */
  multiGuaranteeEquipment?: boolean;
  /** 10연차 시 장비 등급 N 이상 1개 이상 보장 (정예 풀) */
  multiGuaranteeMinGrade?: number;
  /** 던전 스테이지 N 이상 플레이 기록 시 해금 (미설정 = 1, 항상 해금) */
  unlockMinStageOrder?: number;
  entries: GachaPoolEntryDef[];
};

export type GachaRoll =
  | { kind: "gold"; gold: number }
  | { kind: "item"; itemId: string; qty: number }
  | { kind: "equipment"; itemId: string; qty: 1 };

export const GACHA_STARTER_POOL_ID = "equipment_starter";
export const GACHA_EQUIPMENT_POOL_ID = "equipment";
export const GACHA_ELITE_POOL_ID = "equipment_elite";
export const GACHA_MATERIALS_POOL_ID = "materials";

/** @deprecated 레거시 ID — equipment 풀로 매핑 */
export const GACHA_STANDARD_POOL_ID = GACHA_EQUIPMENT_POOL_ID;

export const GACHA_EQUIPMENT_POOL_IDS = [
  GACHA_STARTER_POOL_ID,
  GACHA_EQUIPMENT_POOL_ID,
  GACHA_ELITE_POOL_ID,
] as const;

export type GachaEquipmentPoolId = (typeof GACHA_EQUIPMENT_POOL_IDS)[number];

/** 뽑기 풀 장비 등급 — 10연차 등급 보장용 */
export const GACHA_EQUIPMENT_ITEM_GRADES: Record<string, number> = {
  weapon_wood_sword: 1,
  weapon_stone_sword: 1,
  weapon_red_gold_sword: 2,
  weapon_steel_sword: 3,
  weapon_gold_sword: 4,
  weapon_diamond_sword: 5,
  armor_leather_helmet: 1,
  armor_leather_armor: 1,
  armor_leather_pants: 1,
  armor_leather_boots: 1,
  armor_chain_helmet: 1,
  armor_chain_armor: 1,
  armor_chain_pants: 1,
  armor_chain_boots: 1,
  armor_crimson_helmet: 2,
  armor_crimson_armor: 2,
  armor_crimson_pants: 2,
  armor_crimson_boots: 2,
  armor_iron_helmet: 3,
  armor_iron_armor: 3,
  armor_iron_pants: 3,
  armor_iron_boots: 3,
  armor_golden_helmet: 4,
  armor_golden_armor: 4,
  armor_golden_pants: 4,
  armor_golden_boots: 4,
  armor_diamond_helmet: 5,
  armor_diamond_armor: 5,
  armor_diamond_pants: 5,
  armor_diamond_boots: 5,
};

export function gachaEquipmentGrade(itemId: string): number {
  return GACHA_EQUIPMENT_ITEM_GRADES[itemId] ?? 1;
}

export function isGachaPoolUnlocked(pool: GachaPoolDef, highestDungeonStageOrder: number): boolean {
  const required = pool.unlockMinStageOrder ?? 1;
  return highestDungeonStageOrder >= required;
}

export const GACHA_STARTER_POOL: GachaPoolDef = {
  id: GACHA_STARTER_POOL_ID,
  name: "입문 장비 상자",
  description: "1~2등급 무기·방어구. 튜토리얼·스테이지 1에 맞춘 저렴한 입문용입니다.",
  singleCostGold: 250,
  multiCount: 10,
  multiCostGold: 2_250,
  multiGuaranteeEquipment: true,
  entries: [
    { kind: "equipment", itemId: "weapon_wood_sword", weight: 42 },
    { kind: "equipment", itemId: "weapon_stone_sword", weight: 38 },
    { kind: "equipment", itemId: "weapon_red_gold_sword", weight: 8 },
    { kind: "equipment", itemId: "armor_leather_helmet", weight: 20 },
    { kind: "equipment", itemId: "armor_leather_armor", weight: 20 },
    { kind: "equipment", itemId: "armor_leather_pants", weight: 20 },
    { kind: "equipment", itemId: "armor_leather_boots", weight: 20 },
    { kind: "equipment", itemId: "armor_chain_helmet", weight: 14 },
    { kind: "equipment", itemId: "armor_chain_armor", weight: 14 },
    { kind: "equipment", itemId: "armor_chain_pants", weight: 14 },
    { kind: "equipment", itemId: "armor_chain_boots", weight: 14 },
    { kind: "equipment", itemId: "armor_crimson_helmet", weight: 6 },
    { kind: "equipment", itemId: "armor_crimson_armor", weight: 6 },
    { kind: "equipment", itemId: "armor_crimson_pants", weight: 6 },
    { kind: "equipment", itemId: "armor_crimson_boots", weight: 6 },
  ],
};

export const GACHA_EQUIPMENT_POOL: GachaPoolDef = {
  id: GACHA_EQUIPMENT_POOL_ID,
  name: "장비 상자",
  description: "2~3등급 무기·방어구. 중반 성장용 기본 풀입니다.",
  singleCostGold: 400,
  multiCount: 10,
  multiCostGold: 3_600,
  multiGuaranteeEquipment: true,
  entries: [
    { kind: "equipment", itemId: "weapon_red_gold_sword", weight: 28 },
    { kind: "equipment", itemId: "weapon_steel_sword", weight: 18 },
    { kind: "equipment", itemId: "armor_crimson_helmet", weight: 14 },
    { kind: "equipment", itemId: "armor_crimson_armor", weight: 14 },
    { kind: "equipment", itemId: "armor_crimson_pants", weight: 14 },
    { kind: "equipment", itemId: "armor_crimson_boots", weight: 14 },
    { kind: "equipment", itemId: "armor_iron_helmet", weight: 10 },
    { kind: "equipment", itemId: "armor_iron_armor", weight: 10 },
    { kind: "equipment", itemId: "armor_iron_pants", weight: 10 },
    { kind: "equipment", itemId: "armor_iron_boots", weight: 10 },
  ],
};

export const GACHA_ELITE_POOL: GachaPoolDef = {
  id: GACHA_ELITE_POOL_ID,
  name: "정예 장비 상자",
  description: "3~4등급 무기·방어구. 스테이지 3 이상 플레이 후 해금. 10연차 3등급+ 보장.",
  singleCostGold: 800,
  multiCount: 10,
  multiCostGold: 7_200,
  multiGuaranteeEquipment: true,
  multiGuaranteeMinGrade: 3,
  unlockMinStageOrder: 3,
  entries: [
    { kind: "equipment", itemId: "weapon_steel_sword", weight: 24 },
    { kind: "equipment", itemId: "weapon_gold_sword", weight: 12 },
    { kind: "equipment", itemId: "armor_iron_helmet", weight: 16 },
    { kind: "equipment", itemId: "armor_iron_armor", weight: 16 },
    { kind: "equipment", itemId: "armor_iron_pants", weight: 16 },
    { kind: "equipment", itemId: "armor_iron_boots", weight: 16 },
    { kind: "equipment", itemId: "armor_golden_helmet", weight: 8 },
    { kind: "equipment", itemId: "armor_golden_armor", weight: 8 },
    { kind: "equipment", itemId: "armor_golden_pants", weight: 8 },
    { kind: "equipment", itemId: "armor_golden_boots", weight: 8 },
  ],
};

export const GACHA_MATERIALS_POOL: GachaPoolDef = {
  id: GACHA_MATERIALS_POOL_ID,
  name: "재료 상자",
  description: "강화·가공에 쓰는 재료와 골드를 뽑습니다.",
  singleCostGold: 300,
  multiCount: 10,
  multiCostGold: 2_700,
  entries: [
    { kind: "gold", weight: 90, minGold: 60, maxGold: 140 },
    { kind: "gold", weight: 40, minGold: 140, maxGold: 280 },
    { kind: "gold", weight: 12, minGold: 280, maxGold: 520 },
    { kind: "item", itemId: "item_lesser_mana_stone", weight: 130, minQty: 1, maxQty: 3 },
    { kind: "item", itemId: "item_mana_stone", weight: 42, minQty: 1, maxQty: 1 },
    { kind: "item", itemId: "item_enhance_scroll_protect", weight: 14, minQty: 1, maxQty: 1 },
  ],
};

const GACHA_POOLS: Record<string, GachaPoolDef> = {
  [GACHA_STARTER_POOL_ID]: GACHA_STARTER_POOL,
  [GACHA_EQUIPMENT_POOL_ID]: GACHA_EQUIPMENT_POOL,
  [GACHA_ELITE_POOL_ID]: GACHA_ELITE_POOL,
  [GACHA_MATERIALS_POOL_ID]: GACHA_MATERIALS_POOL,
  /** 레거시 API poolId */
  standard: GACHA_EQUIPMENT_POOL,
};

export function getGachaPool(poolId: string): GachaPoolDef | null {
  return GACHA_POOLS[poolId.trim()] ?? null;
}

export function listGachaPools(): GachaPoolDef[] {
  return [GACHA_STARTER_POOL, GACHA_EQUIPMENT_POOL, GACHA_ELITE_POOL, GACHA_MATERIALS_POOL];
}

export function listGachaEquipmentPools(): GachaPoolDef[] {
  return [GACHA_STARTER_POOL, GACHA_EQUIPMENT_POOL, GACHA_ELITE_POOL];
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

type EquipmentEntry = Extract<GachaPoolEntryDef, { kind: "equipment" }>;

function equipmentEntries(pool: GachaPoolDef): EquipmentEntry[] {
  return pool.entries.filter((e): e is EquipmentEntry => e.kind === "equipment");
}

export function rollGachaEquipment(pool: GachaPoolDef, rnd = Math.random): GachaRoll {
  const equipEntries = equipmentEntries(pool);
  if (!equipEntries.length) return rollGacha(pool, rnd);
  const weights = equipEntries.map((e) => e.weight);
  const idx = pickWeightedIndex(weights, rnd);
  if (idx < 0) return { kind: "equipment", itemId: equipEntries[0]!.itemId, qty: 1 };
  return rollEntry(equipEntries[idx]!, rnd);
}

export function rollGachaEquipmentMinGrade(pool: GachaPoolDef, minGrade: number, rnd = Math.random): GachaRoll {
  const equipEntries = equipmentEntries(pool).filter((e) => gachaEquipmentGrade(e.itemId) >= minGrade);
  if (!equipEntries.length) return rollGachaEquipment(pool, rnd);
  const weights = equipEntries.map((e) => e.weight);
  const idx = pickWeightedIndex(weights, rnd);
  if (idx < 0) return { kind: "equipment", itemId: equipEntries[0]!.itemId, qty: 1 };
  return rollEntry(equipEntries[idx]!, rnd);
}

function applyMultiPullGuarantees(pool: GachaPoolDef, rolls: GachaRoll[], rnd = Math.random): void {
  if (pool.multiGuaranteeEquipment) {
    const hasEquip = rolls.some((r) => r.kind === "equipment");
    if (!hasEquip) rolls[rolls.length - 1] = rollGachaEquipment(pool, rnd);
  }

  const minGrade = pool.multiGuaranteeMinGrade;
  if (minGrade != null && minGrade > 0) {
    const hasMinGrade = rolls.some(
      (r) => r.kind === "equipment" && gachaEquipmentGrade(r.itemId) >= minGrade,
    );
    if (!hasMinGrade) rolls[rolls.length - 1] = rollGachaEquipmentMinGrade(pool, minGrade, rnd);
  }
}

export function rollGachaBatch(pool: GachaPoolDef, count: number, rnd = Math.random): GachaRoll[] {
  const n = Math.max(1, Math.min(10, Math.floor(count)));
  const rolls: GachaRoll[] = [];
  for (let i = 0; i < n; i++) rolls.push(rollGacha(pool, rnd));

  if (n === pool.multiCount) applyMultiPullGuarantees(pool, rolls, rnd);
  return rolls;
}

export function gachaPullCostGold(pool: GachaPoolDef, count: number): number {
  if (count === pool.multiCount) return pool.multiCostGold;
  return pool.singleCostGold;
}
