import { clampItemGrade } from "@/server/itemGrade";

export const WEAPON_OPTION_KINDS = ["ATTACK", "MAGIC_POWER", "ATTACK_SPEED", "CRITICAL"] as const;
export const TOOL_OPTION_KINDS = ["WORK_SPEED", "RARITY_BONUS", "FATIGUE_REDUCTION"] as const;

export type WeaponOptionKind = (typeof WEAPON_OPTION_KINDS)[number];
export type ToolOptionKind = (typeof TOOL_OPTION_KINDS)[number];

export type RolledWeaponOption = { kind: WeaponOptionKind; tier: number };
export type RolledToolOption = { kind: ToolOptionKind; tier: number };
export type RolledOption = RolledWeaponOption | RolledToolOption;

/** UI · 툴팁용 한글 라벨 */
export const OPTION_LABEL_KO: Record<string, string> = {
  ATTACK: "공격력",
  MAGIC_POWER: "마법력",
  ATTACK_SPEED: "공격속도",
  CRITICAL: "크리티컬",
  WORK_SPEED: "작업 속도",
  RARITY_BONUS: "희귀도",
  FATIGUE_REDUCTION: "피로도 감소",
};

/** 옵션 티어 T1~T9에 대응하는 대표 수치(표시용) */
export function optionTierDisplayValue(kind: string, tier: number): number {
  const t = Math.max(1, Math.min(9, Math.floor(tier)));
  const base = 3 + t * 2;
  if (kind === "CRITICAL" || kind === "RARITY_BONUS") return Math.min(99, 5 + t * 4);
  if (kind === "FATIGUE_REDUCTION") return Math.min(99, 4 + t * 3);
  return base;
}

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

/** 아이템 등급(1~8)에 따라 붙을 수 있는 최대 옵션 개수 (최대 4, 등급별 차등) */
export function maxOptionSlotsForGrade(grade: number): number {
  const g = clampItemGrade(grade);
  const table: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4 };
  return table[g] ?? 1;
}

/** 실제 부여 개수: 저등급은 가끠 한 칸만 */
function rollFilledSlotCount(grade: number, maxSlots: number, rnd: () => number): number {
  if (maxSlots <= 1) return 1;
  if (grade <= 2 && rnd() < 0.4) return 1;
  return maxSlots;
}

/** 등급이 높을수록 T7~T9 비중 증가 */
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

export function rollOptionsForCraft(input: {
  category: string;
  itemGrade: number;
  rnd?: () => number;
}): RolledOption[] {
  const rnd = input.rnd ?? Math.random;
  const grade = clampItemGrade(input.itemGrade);
  const pool: string[] =
    input.category === "무기"
      ? [...WEAPON_OPTION_KINDS]
      : input.category === "도구"
        ? [...TOOL_OPTION_KINDS]
        : [];

  if (pool.length === 0) return [];

  const maxSlots = maxOptionSlotsForGrade(grade);
  const count = Math.min(pool.length, rollFilledSlotCount(grade, maxSlots, rnd));
  const kinds = shuffle(pool, rnd).slice(0, count);

  if (input.category === "무기") {
    return kinds.map((kind) => ({
      kind: kind as WeaponOptionKind,
      tier: rollOptionTier(grade, rnd),
    }));
  }
  if (input.category === "도구") {
    return kinds.map((kind) => ({
      kind: kind as ToolOptionKind,
      tier: rollOptionTier(grade, rnd),
    }));
  }
  return [];
}

export function serializeOptions(opts: RolledOption[]): string {
  return JSON.stringify(opts);
}

export function parseOptionsJson(json: string | null | undefined): RolledOption[] {
  if (!json || json === "[]") return [];
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x) => x && typeof x === "object" && "kind" in x && "tier" in x) as RolledOption[];
  } catch {
    return [];
  }
}

function isWeaponOption(o: RolledOption): o is RolledWeaponOption {
  return (WEAPON_OPTION_KINDS as readonly string[]).includes(o.kind);
}

/** 던전 전투력 보정: 무기 옵션만 합산 */
export function formatOptionRows(opts: RolledOption[]) {
  return opts.map((o) => ({
    kind: o.kind,
    label: OPTION_LABEL_KO[o.kind] ?? o.kind,
    tier: Math.max(1, Math.min(9, Math.floor(o.tier))),
    tierLabel: `T${Math.max(1, Math.min(9, Math.floor(o.tier)))}`,
    displayValue: optionTierDisplayValue(o.kind, o.tier),
  }));
}

export function weaponCombatBonusFromOptions(json: string | null | undefined): number {
  const opts = parseOptionsJson(json).filter(isWeaponOption);
  let sum = 0;
  for (const o of opts) {
    const t = Math.max(1, Math.min(9, Math.floor(o.tier)));
    const w = t * 0.22;
    if (o.kind === "ATTACK") sum += w * 1.25;
    else if (o.kind === "MAGIC_POWER") sum += w * 1.05;
    else if (o.kind === "ATTACK_SPEED") sum += w * 0.85;
    else if (o.kind === "CRITICAL") sum += w * 0.95;
  }
  return Math.round(sum * 100) / 100;
}
