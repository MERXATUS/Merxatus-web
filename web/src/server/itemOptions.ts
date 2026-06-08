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
import {
  blessedSlotRealms,
  blessingOptionIdsForRealm,
  realmLabelKo,
  rollBlessingAffix,
  type OptionRealm,
} from "@/shared/equipmentBlessings";
import {
  filterOptionIdsForGrade,
  maxOptionTierForGrade,
  rollOptionTierForGrade,
  type OptionTierRollMode,
} from "@/shared/optionTierBalance";

export type RolledOption = {
  optionId: string;
  tier: number;
  realm?: OptionRealm;
  affix?: string;
};

function shuffle<T>(arr: T[], rnd: () => number): T[] {

  const a = [...arr];

  for (let i = a.length - 1; i > 0; i--) {

    const j = Math.floor(rnd() * (i + 1));

    [a[i], a[j]] = [a[j]!, a[i]!];

  }

  return a;

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



/** @deprecated — `rollOptionTierForGrade(grade, "craft", rnd)` 사용 */

export function rollOptionTier(grade: number, rnd: () => number): number {

  return rollOptionTierForGrade(grade, "craft", rnd);

}



/** @deprecated — `rollOptionTierForGrade(grade, "loot", rnd)` 사용 */

export function rollLootOptionTier(grade: number, rnd: () => number): number {

  return rollOptionTierForGrade(grade, "loot", rnd);

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



function optionPoolForCategory(category: string, itemGrade: number): string[] {

  const grade = clampItemGrade(itemGrade);

  if (category === "무기") return filterOptionIdsForGrade(weaponOptionIds(), grade, "weapon");

  if (category === "방어구") return filterOptionIdsForGrade(armorOptionIds(), grade, "armor");

  return [];

}



function pickFromPool(pool: string[], used: Set<string>, rnd: () => number): string | null {
  let candidates = pool.filter((id) => !used.has(normalizeOptionId(id)));
  if (candidates.length === 0) candidates = pool;
  if (candidates.length === 0) return null;
  return shuffle(candidates, rnd)[0] ?? null;
}

function capLootTierForOption(optionId: string, tier: number, grade: number): number {
  const id = normalizeOptionId(optionId);
  let capped = Math.max(1, Math.min(maxOptionTierForGrade(grade, "loot"), Math.floor(tier)));
  if (id === "ITEM_RARITY_PCT") {
    capped = Math.min(capped, Math.max(1, maxOptionTierForGrade(grade, "loot") - 1), 5);
  }
  return capped;
}

function rollBlessedOptionsForLoot(input: {
  category: string;
  itemGrade: number;
  slotCount: number;
  rnd: () => number;
}): RolledOption[] {
  const grade = clampItemGrade(input.itemGrade);
  const poolKind = input.category === "무기" ? "weapon" : input.category === "방어구" ? "armor" : null;
  if (!poolKind) return [];

  const realms = blessedSlotRealms(input.slotCount);
  const usedIds = new Set<string>();
  const out: RolledOption[] = [];

  for (const realm of realms) {
    let ids = filterOptionIdsForGrade(
      blessingOptionIdsForRealm(poolKind, realm),
      grade,
      poolKind,
    );
    if (realm === "abyss") {
      const hasRarity = out.some((o) => normalizeOptionId(o.optionId) === "ITEM_RARITY_PCT");
      if (hasRarity) ids = ids.filter((id) => normalizeOptionId(id) !== "ITEM_RARITY_PCT");
    }
    const picked = pickFromPool(ids, usedIds, input.rnd);
    if (!picked) continue;
    usedIds.add(normalizeOptionId(picked));
    const tier = capLootTierForOption(
      picked,
      rollOptionTierForGrade(grade, "loot", input.rnd),
      grade,
    );
    out.push({
      optionId: picked,
      tier,
      realm,
      affix: rollBlessingAffix(realm, input.rnd),
    });
  }

  return out;
}

function rollOptionsFromPool(input: {

  category: string;

  itemGrade: number;

  slotCount: number;

  tierMode: OptionTierRollMode;

  rnd: () => number;

}): RolledOption[] {

  const grade = clampItemGrade(input.itemGrade);

  const pool = optionPoolForCategory(input.category, grade);

  if (pool.length === 0 || input.slotCount <= 0) return [];



  const count = Math.min(pool.length, input.slotCount);

  const ids = shuffle(pool, input.rnd).slice(0, count);

  return ids.map((optionId) => ({

    optionId,

    tier: rollOptionTierForGrade(grade, input.tierMode, input.rnd),

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

    tierMode: "craft",

    rnd,

  });

}



/** 던전·레이드·무탑 등 전투 루트 장비 드랍 — 천계(접두)+마계(접미) 축복 */
export function rollOptionsForLootDrop(input: {
  category: string;
  itemGrade: number;
  rnd?: () => number;
}): RolledOption[] {
  const rnd = input.rnd ?? Math.random;
  const grade = clampItemGrade(input.itemGrade);
  const slotCount = Math.max(2, rollLootOptionSlotCount(grade, rnd));
  return rollBlessedOptionsForLoot({
    category: input.category,
    itemGrade: grade,
    slotCount,
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

    if (Array.isArray(v)) return parseOptionsArray(v);

    if (v && typeof v === "object" && Array.isArray((v as { options?: unknown }).options)) {

      return parseOptionsArray((v as { options: unknown }).options);

    }

    return [];

  } catch {

    return [];

  }

}



function parseOptionsArray(v: unknown): RolledOption[] {

  if (!Array.isArray(v)) return [];

  return v

    .map((x) => {

      if (!x || typeof x !== "object") return null;

      const row = x as { optionId?: string; kind?: string; tier?: number };

      const rawId = row.optionId ?? row.kind;

      if (typeof rawId !== "string" || typeof row.tier !== "number") return null;

      const realmRaw = (row as { realm?: unknown }).realm;
      const affixRaw = (row as { affix?: unknown }).affix;
      const realm =
        realmRaw === "celestial" || realmRaw === "abyss" ? realmRaw : undefined;
      const affix = typeof affixRaw === "string" && affixRaw.trim() ? affixRaw.trim() : undefined;
      return {
        optionId: normalizeOptionId(rawId),
        tier: row.tier,
        ...(realm ? { realm } : {}),
        ...(affix ? { affix } : {}),
      };

    })

    .filter(Boolean) as RolledOption[];

}



/** 혼돈의 보석 — 티어 유지, 봉인 슬롯 제외하고 optionId만 재추첨 */

export function rollOptionIdsKeepingTiers(

  options: RolledOption[],

  pool: string[],

  lockedIndices: ReadonlySet<number>,

  rnd = Math.random,

): RolledOption[] {

  if (pool.length === 0) return options;

  return options.map((o, i) => {

    if (lockedIndices.has(i)) return o;

    const used = new Set(

      options.filter((_, j) => j !== i && !lockedIndices.has(j)).map((x) => normalizeOptionId(x.optionId)),

    );

    let candidates = pool.filter((id) => !used.has(id));

    if (candidates.length === 0) candidates = pool;

    const picked = shuffle(candidates, rnd)[0] ?? pool[0]!;

    return { optionId: picked, tier: o.tier };

  });

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
      realm: o.realm,
      affix: o.affix ?? null,
      realmLabel: o.realm ? realmLabelKo(o.realm) : undefined,
    };

  });

}



export function weaponCombatBonusFromOptions(json: string | null | undefined): number {

  return weaponPowerBonusFromOptionRows(parseOptionsJson(json));

}



export function equipmentStatBonusFromOptions(json: string | null | undefined, pool: "weapon" | "armor") {

  return statBonusFromOptionRows(parseOptionsJson(json), pool);

}


