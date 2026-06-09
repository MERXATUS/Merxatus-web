import { formatOptionRows, parseOptionsJson, type RolledOption } from "@/server/itemOptions";
import { armorOptionIds, weaponOptionIds } from "@/shared/itemOptionCatalog";
import {
  blessingOptionIdsForRealm,
  defaultAffixForRealm,
  realmLabelKo,
} from "@/shared/equipmentBlessings";
import { clampOptionTierToGrade, filterOptionIdsForGrade } from "@/shared/optionTierBalance";

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
      hidden: true,
      locked: locked.has(i),
      realm: opt.realm,
      affix: opt.affix ?? (opt.realm ? defaultAffixForRealm(opt.realm) : null),
      realmLabel: opt.realm ? realmLabelKo(opt.realm) : undefined,
    }));
  }
  const rows = formatOptionRows(payload.options, category);
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
