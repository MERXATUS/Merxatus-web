import { clampItemGrade } from "@/server/itemGrade";
import {
  armorOptionIds,
  formatOptionValueForDisplay,
  normalizeOptionId,
  optionDisplayName,
  statBonusFromOptionRows,
  weaponOptionIds,
  weaponPowerBonusFromOptionRows,
} from "@/shared/itemOptionCatalog";

export type RolledOption = { optionId: string; tier: number };

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function pickWeightedIndex(weights: number[], rnd: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

export function maxOptionSlotsForGrade(grade: number): number {
  const g = clampItemGrade(grade);
  const table: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4 };
  return table[g] ?? 1;
}

function rollFilledSlotCount(grade: number, maxSlots: number, rnd: () => number): number {
  if (maxSlots <= 1) return 1;
  if (grade <= 2 && rnd() < 0.4) return 1;
  return maxSlots;
}

export function rollOptionTier(grade: number, rnd: () => number): number {
  const g = clampItemGrade(grade);
  const weights: number[] = [];
  for (let t = 1; t <= 9; t++) {
    const lowPull = (10 - t) * (9 - g) * 0.08;
    const highPull = t * (g - 1) * 0.11;
    weights.push(0.25 + lowPull + highPull);
  }
  return 1 + pickWeightedIndex(weights, rnd);
}

/** 던전·레이드 루트 드랍 — 등급별 옵션 슬롯 수(최소~최대) */
const LOOT_OPTION_SLOT_RANGE: Record<number, { min: number; max: number }> = {
  1: { min: 1, max: 1 },
  2: { min: 1, max: 1 },
  3: { min: 1, max: 2 },
  4: { min: 2, max: 2 },
  5: { min: 2, max: 3 },
  6: { min: 3, max: 3 },
  7: { min: 3, max: 4 },
  8: { min: 4, max: 4 },
};

function rollLootOptionSlotCount(grade: number, rnd: () => number): number {
  const g = clampItemGrade(grade);
  const range = LOOT_OPTION_SLOT_RANGE[g] ?? { min: 1, max: 1 };
  if (range.min >= range.max) return range.max;
  const fillBias = Math.min(0.88, 0.32 + g * 0.09);
  if (rnd() < fillBias) return range.max;
  return range.min + Math.floor(rnd() * (range.max - range.min + 1));
}

/** 루트 드랍 — 등급이 높을수록 T구간이 위로 이동 */
export function rollLootOptionTier(grade: number, rnd: () => number): number {
  const g = clampItemGrade(grade);
  const tierMin = Math.max(1, Math.min(7, Math.floor((g - 1) * 0.85 + 1)));
  const tierCap = Math.min(9, tierMin + Math.max(2, Math.ceil(g * 0.65)));
  const weights: number[] = [];
  for (let t = 1; t <= 9; t++) {
    if (t < tierMin) {
      weights.push(0.04);
      continue;
    }
    if (t > tierCap) {
      weights.push(0.05 * Math.max(0, 10 - t));
      continue;
    }
    const center = tierMin + (tierCap - tierMin) * 0.55;
    weights.push(Math.max(0.08, 1.15 - Math.abs(t - center) * 0.32));
  }
  return 1 + pickWeightedIndex(weights, rnd);
}

function optionPoolForCategory(category: string): string[] {
  if (category === "무기") return weaponOptionIds();
  if (category === "방어구") return armorOptionIds();
  return [];
}

function rollOptionsFromPool(input: {
  category: string;
  itemGrade: number;
  slotCount: number;
  tierRoller: (grade: number, rnd: () => number) => number;
  rnd: () => number;
}): RolledOption[] {
  const grade = clampItemGrade(input.itemGrade);
  const pool = optionPoolForCategory(input.category);
  if (pool.length === 0 || input.slotCount <= 0) return [];

  const count = Math.min(pool.length, input.slotCount);
  const ids = shuffle(pool, input.rnd).slice(0, count);
  return ids.map((optionId) => ({
    optionId,
    tier: input.tierRoller(grade, input.rnd),
  }));
}

export function rollOptionsForCraft(input: {
  category: string;
  itemGrade: number;
  rnd?: () => number;
}): RolledOption[] {
  const rnd = input.rnd ?? Math.random;
  const grade = clampItemGrade(input.itemGrade);
  const maxSlots = maxOptionSlotsForGrade(grade);
  const slotCount = Math.min(maxSlots, rollFilledSlotCount(grade, maxSlots, rnd));
  return rollOptionsFromPool({
    category: input.category,
    itemGrade: grade,
    slotCount,
    tierRoller: rollOptionTier,
    rnd,
  });
}

/** 던전·레이드·무탑 등 전투 루트 장비 드랍 */
export function rollOptionsForLootDrop(input: {
  category: string;
  itemGrade: number;
  rnd?: () => number;
}): RolledOption[] {
  const rnd = input.rnd ?? Math.random;
  const grade = clampItemGrade(input.itemGrade);
  const slotCount = rollLootOptionSlotCount(grade, rnd);
  return rollOptionsFromPool({
    category: input.category,
    itemGrade: grade,
    slotCount,
    tierRoller: rollLootOptionTier,
    rnd,
  });
}

export function serializeOptions(opts: RolledOption[]): string {
  return JSON.stringify(opts);
}

export function parseOptionsJson(json: string | null | undefined): RolledOption[] {
  if (!json || json === "[]") return [];
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const row = x as { optionId?: string; kind?: string; tier?: number };
        const rawId = row.optionId ?? row.kind;
        if (typeof rawId !== "string" || typeof row.tier !== "number") return null;
        return { optionId: normalizeOptionId(rawId), tier: row.tier };
      })
      .filter(Boolean) as RolledOption[];
  } catch {
    return [];
  }
}

export function formatOptionRows(opts: RolledOption[], category: "weapon" | "armor" = "weapon") {
  return opts.map((o) => {
    const optionId = normalizeOptionId(o.optionId);
    const tier = Math.max(1, Math.min(9, Math.floor(o.tier)));
    return {
      kind: optionId,
      optionId,
      label: optionDisplayName(optionId, category),
      tier,
      tierLabel: `T${tier}`,
      displayValue: formatOptionValueForDisplay(optionId, tier, category),
    };
  });
}

export function weaponCombatBonusFromOptions(json: string | null | undefined): number {
  return weaponPowerBonusFromOptionRows(parseOptionsJson(json));
}

export function equipmentStatBonusFromOptions(json: string | null | undefined, pool: "weapon" | "armor") {
  return statBonusFromOptionRows(parseOptionsJson(json), pool);
}
