import { formatOptionRows, parseOptionsJson, type RolledOption } from "@/server/itemOptions";
import { armorOptionIds, weaponOptionIds } from "@/shared/itemOptionCatalog";
import {
  blessingOptionIdsForRealm,
  defaultAffixForRealm,
  realmLabelKo,
  rollBlessingAffix,
  type OptionRealm,
} from "@/shared/equipmentBlessings";
import {
  rollVoidAffix,
  voidOptionIdsForGrade,
} from "@/shared/equipmentVoidOptions";
import { lootOptionSlotCountForGrade } from "@/shared/lootOptionBalance";
import {
  clampOptionTierToGrade,
  filterOptionIdsForGrade,
  maxOptionTierForGrade,
  rollOptionTierForGrade,
  rollOptionTierForGradeWithMinimum,
} from "@/shared/optionTierBalance";

export type EquipmentOptionsPayload = {
  identified: boolean;
  lockedIndices: number[];
  options: RolledOption[];
};

export type EquipmentOptionDisplayRow = ReturnType<typeof formatOptionRows>[number] & {
  hidden: boolean;
  locked: boolean;
};

const MAX_LOCKED_SLOTS = 1;

export function parseEquipmentOptionsPayload(json: string | null | undefined): EquipmentOptionsPayload {
  if (!json || json === "[]") {
    return { identified: true, lockedIndices: [], options: [] };
  }
  try {
    const v = JSON.parse(json) as unknown;
    if (Array.isArray(v)) {
      return { identified: true, lockedIndices: [], options: parseOptionsJson(json) };
    }
    if (!v || typeof v !== "object") {
      return { identified: true, lockedIndices: [], options: [] };
    }
    const row = v as {
      identified?: boolean;
      locked?: number[];
      lockedIndices?: number[];
      options?: unknown;
    };
    const lockedRaw = row.lockedIndices ?? row.locked ?? [];
    const lockedIndices = Array.isArray(lockedRaw)
      ? lockedRaw
          .map((x) => Math.floor(Number(x)))
          .filter((i) => i >= 0)
          .slice(0, MAX_LOCKED_SLOTS)
      : [];
    return {
      identified: row.identified !== false,
      lockedIndices,
      options: parseLegacyOptionArray(row.options),
    };
  } catch {
    return { identified: true, lockedIndices: [], options: [] };
  }
}

function parseLegacyOptionArray(raw: unknown): RolledOption[] {
  if (!Array.isArray(raw)) return [];
  return parseOptionsJson(JSON.stringify(raw));
}

export function serializeEquipmentOptionsPayload(payload: EquipmentOptionsPayload): string {
  const lockedIndices = payload.lockedIndices.slice(0, MAX_LOCKED_SLOTS);
  if (payload.identified && lockedIndices.length === 0 && payload.options.length > 0) {
    return JSON.stringify(payload.options);
  }
  return JSON.stringify({
    identified: payload.identified,
    lockedIndices,
    options: payload.options,
  });
}

export function equipmentOptionsForLootDrop(options: RolledOption[], identified = false): string {
  return serializeEquipmentOptionsPayload({
    identified,
    lockedIndices: [],
    options,
  });
}

export function lockedIndexSet(payload: EquipmentOptionsPayload): ReadonlySet<number> {
  return new Set(payload.lockedIndices);
}

export function formatEquipmentOptionDisplay(
  json: string | null | undefined,
  category: "weapon" | "armor",
  baseItemId?: string,
): EquipmentOptionDisplayRow[] {
  const payload = parseEquipmentOptionsPayload(json);
  const locked = lockedIndexSet(payload);
  if (!payload.identified) {
    return payload.options.map((opt, i) => ({
      kind: "UNKNOWN",
      optionId: "UNKNOWN",
      label: "???",
      tier: 0,
      tierLabel: "?",
      displayValue: 0,
      isPercent: false,
      flatBonus: undefined,
      hidden: true,
      locked: locked.has(i),
      realm: opt.realm,
      affix: opt.affix ?? (opt.realm ? defaultAffixForRealm(opt.realm) : null),
      realmLabel: opt.realm ? realmLabelKo(opt.realm) : undefined,
    }));
  }
  const rows = formatOptionRows(payload.options, category, baseItemId);
  return rows.map((r, i) => ({
    ...r,
    hidden: false,
    locked: locked.has(i),
  }));
}

/** 전투·스탯 — 미감정이어도 실제 옵션 적용 */
export function combatOptionsFromJson(json: string | null | undefined): RolledOption[] {
  return parseEquipmentOptionsPayload(json).options;
}

/** 천계의 서·마계의 서 — 모든 옵션 슬롯을 해당 계열로 변환 (티어 유지, 봉인 슬롯 포함) */
export function convertAllOptionsToRealmInPayload(
  payload: EquipmentOptionsPayload,
  category: "weapon" | "armor",
  itemGrade: number,
  realm: OptionRealm,
  rnd = Math.random,
): EquipmentOptionsPayload {
  const pool = filterOptionIdsForGrade(
    blessingOptionIdsForRealm(category, realm),
    itemGrade,
    category,
  );
  if (pool.length === 0) {
    throw new Error("NO_REALM_OPTION_POOL");
  }

  const rolled = payload.options.map((o) => {
    const picked = pool[Math.floor(rnd() * pool.length)] ?? pool[0]!;
    const baseTier =
      o.tier > 0 ? o.tier : rollOptionTierForGrade(itemGrade, "loot", rnd);
    return {
      optionId: picked,
      tier: clampOptionTierToGrade(baseTier, itemGrade, "loot"),
      realm,
      affix: rollBlessingAffix(realm, rnd),
    };
  });
  return { ...payload, options: rolled };
}

export function rerollOptionIdsKeepingTiersInPayload(
  payload: EquipmentOptionsPayload,
  category: "weapon" | "armor",
  itemGrade: number,
  rnd = Math.random,
): EquipmentOptionsPayload {
  const locked = lockedIndexSet(payload);
  const fullPool = filterOptionIdsForGrade(
    category === "weapon" ? weaponOptionIds() : armorOptionIds(),
    itemGrade,
    category,
  );
  const rolled = payload.options.map((o, i) => {
    if (locked.has(i)) return o;
    const pool = o.realm
      ? filterOptionIdsForGrade(
          blessingOptionIdsForRealm(category, o.realm),
          itemGrade,
          category,
        )
      : fullPool;
    const pickPool = pool.length > 0 ? pool : fullPool;
    const picked = pickPool[Math.floor(rnd() * pickPool.length)] ?? o.optionId;
    return {
      ...o,
      optionId: picked,
      tier: clampOptionTierToGrade(o.tier, itemGrade, "craft"),
    };
  });
  return { ...payload, options: rolled };
}

/** 변형 계열 보석 — 모든 옵션 종류·티어 재추첨 (봉인 슬롯 유지) */
export function rerollAllOptionsAndTiersInPayload(
  payload: EquipmentOptionsPayload,
  category: "weapon" | "armor",
  itemGrade: number,
  minTier: number | null,
  rnd = Math.random,
): EquipmentOptionsPayload {
  const locked = lockedIndexSet(payload);
  const fullPool = filterOptionIdsForGrade(
    category === "weapon" ? weaponOptionIds() : armorOptionIds(),
    itemGrade,
    category,
  );
  const rolled = payload.options.map((o, i) => {
    if (locked.has(i)) return o;
    const pool = o.realm
      ? filterOptionIdsForGrade(
          blessingOptionIdsForRealm(category, o.realm),
          itemGrade,
          category,
        )
      : fullPool;
    const pickPool = pool.length > 0 ? pool : fullPool;
    const picked = pickPool[Math.floor(rnd() * pickPool.length)] ?? pickPool[0]!;
    const tier =
      minTier != null && minTier > 0
        ? rollOptionTierForGradeWithMinimum(itemGrade, minTier, rnd)
        : rollOptionTierForGrade(itemGrade, "craft", rnd);
    const useRealm = !!o.realm && pickPool !== fullPool;
    return {
      optionId: picked,
      tier: clampOptionTierToGrade(tier, itemGrade, "craft"),
      ...(useRealm ? { realm: o.realm!, affix: rollBlessingAffix(o.realm!, rnd) } : {}),
    };
  });
  return { ...payload, options: rolled };
}

export function removeRandomUnlockedOption(
  payload: EquipmentOptionsPayload,
  rnd = Math.random,
): EquipmentOptionsPayload | null {
  const locked = lockedIndexSet(payload);
  const removable = payload.options
    .map((_, i) => i)
    .filter((i) => !locked.has(i));
  if (removable.length === 0) return null;
  const pick = removable[Math.floor(rnd() * removable.length)]!;
  const nextOpts = payload.options.filter((_, i) => i !== pick);
  const nextLocked = payload.lockedIndices
    .map((i) => (i > pick ? i - 1 : i))
    .filter((i) => i >= 0);
  return { ...payload, options: nextOpts, lockedIndices: nextLocked };
}

export function sealRandomUnlockedSlot(
  payload: EquipmentOptionsPayload,
  rnd = Math.random,
): EquipmentOptionsPayload | null {
  if (payload.lockedIndices.length >= MAX_LOCKED_SLOTS) return null;
  if (!payload.identified) return null;
  const locked = lockedIndexSet(payload);
  const candidates = payload.options.map((_, i) => i).filter((i) => !locked.has(i));
  if (candidates.length === 0) return null;
  const pick = candidates[Math.floor(rnd() * candidates.length)]!;
  return { ...payload, lockedIndices: [pick] };
}

export function appraisePayload(payload: EquipmentOptionsPayload): EquipmentOptionsPayload | null {
  if (payload.identified) return null;
  return { ...payload, identified: true };
}

/** 승천의 보석 — 옵션 1개 티어 +1 (등급 상한까지) */
export function ascendRandomOptionTierInPayload(
  payload: EquipmentOptionsPayload,
  itemGrade: number,
  rnd = Math.random,
): EquipmentOptionsPayload {
  if (payload.options.length === 0) throw new Error("NO_OPTIONS");
  const pick = Math.floor(rnd() * payload.options.length);
  const cap = maxOptionTierForGrade(itemGrade, "craft");
  const options = payload.options.map((o, i) => {
    if (i !== pick) return o;
    return { ...o, tier: Math.min(cap, Math.max(1, o.tier + 1)) };
  });
  return { ...payload, options };
}

/** 태초의 보석 — 모든 옵션·봉인 제거 */
export function clearAllOptionsInPayload(payload: EquipmentOptionsPayload): EquipmentOptionsPayload {
  return { identified: true, lockedIndices: [], options: [] };
}

/** 공허의 보석 — 옵션 1개를 공허 옵션으로 재지정 */
export function rerollRandomOptionToVoidInPayload(
  payload: EquipmentOptionsPayload,
  category: "weapon" | "armor",
  itemGrade: number,
  rnd = Math.random,
): EquipmentOptionsPayload {
  if (payload.options.length === 0) throw new Error("NO_OPTIONS");
  const pool = voidOptionIdsForGrade(category, itemGrade);
  if (pool.length === 0) throw new Error("NO_VOID_OPTION_POOL");
  const pick = Math.floor(rnd() * payload.options.length);
  const voidId = pool[Math.floor(rnd() * pool.length)] ?? pool[0]!;
  const options = payload.options.map((o, i) => {
    if (i !== pick) return o;
    return {
      optionId: voidId,
      tier: clampOptionTierToGrade(o.tier, itemGrade, "craft"),
      realm: "void" as OptionRealm,
      affix: rollVoidAffix(rnd),
    };
  });
  return { ...payload, options };
}

/** 확장의 보석 — 빈 슬롯 1개 랜덤 채움 (등급별 최대 슬롯까지) */
export function expandRandomOptionSlotInPayload(
  payload: EquipmentOptionsPayload,
  category: "weapon" | "armor",
  itemGrade: number,
  rnd = Math.random,
): EquipmentOptionsPayload {
  const maxSlots = lootOptionSlotCountForGrade(itemGrade);
  if (payload.options.length >= maxSlots) throw new Error("NO_EMPTY_SLOT");
  const pool = filterOptionIdsForGrade(
    category === "weapon" ? weaponOptionIds() : armorOptionIds(),
    itemGrade,
    category,
  );
  if (pool.length === 0) throw new Error("NO_OPTION_POOL");
  const optionId = pool[Math.floor(rnd() * pool.length)] ?? pool[0]!;
  const tier = rollOptionTierForGrade(itemGrade, "craft", rnd);
  return {
    ...payload,
    options: [
      ...payload.options,
      { optionId, tier: clampOptionTierToGrade(tier, itemGrade, "craft") },
    ],
  };
}

/** 전이의 보석 — source 옵션을 target으로 이전, source는 비움 */
export function transferOptionsBetweenPayloads(
  source: EquipmentOptionsPayload,
  target: EquipmentOptionsPayload,
): { source: EquipmentOptionsPayload; target: EquipmentOptionsPayload } {
  if (source.options.length === 0) throw new Error("NO_OPTIONS");
  return {
    source: { identified: true, lockedIndices: [], options: [] },
    target: {
      identified: true,
      options: source.options.map((o) => ({ ...o })),
      lockedIndices: [...source.lockedIndices],
    },
  };
}
