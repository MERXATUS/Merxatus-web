import type { StatusApplySpec } from "@/shared/combatStatus";
import { normalizeOptionId } from "@/shared/itemOptionCatalog";

type OptionRow = { optionId?: string; kind?: string; tier?: number };

/** 장비 옵션 → 전투 중 상태 부여 (Phase 3) */
const WEAPON_ON_HIT: Record<string, (tier: number) => StatusApplySpec | null> = {
  MAG_ATK_ADD: (tier) =>
    tier >= 2
      ? { status: "burn", chancePct: 6 + tier * 4, turns: 2, potency: 3 + tier * 2, maxStacks: 3 }
      : null,
  ATK_SPD_PCT: (tier) =>
    tier >= 3 ? { status: "shock", chancePct: 10 + tier * 3, turns: 2, potency: 2 + tier, maxStacks: 2 } : null,
  CRIT_CHANCE_PCT: (tier) =>
    tier >= 4 ? { status: "freeze", chancePct: 5 + tier, turns: 1, potency: 100, maxStacks: 1 } : null,
};

const ARMOR_ON_FIGHT_START: Record<string, (tier: number) => StatusApplySpec | null> = {
  THORN_PCT: (tier) =>
    tier >= 2
      ? { status: "counter", chancePct: 100, turns: 99, potency: 8 + tier * 4, maxStacks: 1 }
      : null,
};

function rowsFromOptionsJson(json: string | null | undefined): OptionRow[] {
  if (!json || json === "[]") return [];
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x) => x && typeof x === "object") as OptionRow[];
  } catch {
    return [];
  }
}

function specsFromRows(
  rows: OptionRow[],
  table: Record<string, (tier: number) => StatusApplySpec | null>,
): StatusApplySpec[] {
  const out: StatusApplySpec[] = [];
  for (const row of rows) {
    const id = normalizeOptionId(String(row.optionId ?? row.kind ?? ""));
    const tier = Math.max(1, Math.floor(row.tier ?? 1));
    const fn = table[id];
    if (!fn) continue;
    const spec = fn(tier);
    if (spec) out.push(spec);
  }
  return out;
}

export function equipmentStatusEffectsFromGear(input: {
  weaponOptionsJson?: string | null;
  armorOptionsJsonList?: Array<string | null | undefined>;
}): { onHit: StatusApplySpec[]; onFightStartSelf: StatusApplySpec[] } {
  const onHit = specsFromRows(rowsFromOptionsJson(input.weaponOptionsJson), WEAPON_ON_HIT);
  const onFightStartSelf: StatusApplySpec[] = [];
  for (const json of input.armorOptionsJsonList ?? []) {
    onFightStartSelf.push(...specsFromRows(rowsFromOptionsJson(json), ARMOR_ON_FIGHT_START));
  }
  return { onHit, onFightStartSelf };
}
