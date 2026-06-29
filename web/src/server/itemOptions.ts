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
  blessingOptionIdsForRealm,
  realmLabelKo,
  rollBlessingAffix,
  rollLootRealmForSlot,
  type OptionRealm,
} from "@/shared/equipmentBlessings";
import { lootOptionSlotCountForGrade } from "@/shared/lootOptionBalance";
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

export function maxOptionSlotsForGrade(grade: number): number {
  return lootOptionSlotCountForGrade(grade);
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



function optionPoolForCategory(category: string, itemGrade: number): string[] {

  const grade = clampItemGrade(itemGrade);

  if (category === "무기") return filterOptionIdsForGrade(weaponOptionIds(), grade, "weapon");

  if (category === "방어구") return filterOptionIdsForGrade(armorOptionIds(), grade, "armor");

  return [];

}



function pickRandomFromPool(pool: string[], rnd: () => number): string | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(rnd() * pool.length)] ?? null;
}

function capLootTierForOption(_optionId: string, tier: number, grade: number): number {
  return Math.max(1, Math.min(maxOptionTierForGrade(grade, "loot"), Math.floor(tier)));
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

  const out: RolledOption[] = [];

  for (let i = 0; i < input.slotCount; i++) {
    const realm = rollLootRealmForSlot(input.rnd);
    const ids = filterOptionIdsForGrade(
      blessingOptionIdsForRealm(poolKind, realm),
      grade,
      poolKind,
    );
    const picked = pickRandomFromPool(ids, input.rnd);
    if (!picked) continue;
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



  const out: RolledOption[] = [];
  for (let i = 0; i < input.slotCount; i++) {
    const optionId = pickRandomFromPool(pool, input.rnd);
    if (!optionId) break;
    out.push({
      optionId,
      tier: rollOptionTierForGrade(grade, input.tierMode, input.rnd),
    });
  }
  return out;

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
  const slotCount = lootOptionSlotCountForGrade(grade);
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
        realmRaw === "celestial" || realmRaw === "abyss" || realmRaw === "void" ? realmRaw : undefined;
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

    const picked = pickRandomFromPool(pool, rnd) ?? pool[0]!;

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


