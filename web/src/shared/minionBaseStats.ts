export type MinionBaseStats = {
  strength: number;
  agility: number;
  intelligence: number;
  endurance: number;
};

export type MinionStatKey = keyof MinionBaseStats;

export const MINION_STAT_KEYS: MinionStatKey[] = ["strength", "agility", "intelligence", "endurance"];

export const MINION_STAT_LABELS: Record<MinionStatKey, string> = {
  strength: "힘",
  agility: "민첩",
  intelligence: "지능",
  endurance: "인내",
};

/** 생성·미배분 시 기본값 — 레벨업으로만 성장 */
export const DEFAULT_MINION_BASE_STATS: MinionBaseStats = {
  strength: 0,
  agility: 0,
  intelligence: 0,
  endurance: 0,
};

export function totalMinionBaseStats(stats: MinionBaseStats): number {
  return MINION_STAT_KEYS.reduce((sum, key) => sum + stats[key], 0);
}

export function normalizeMinionBaseStats(
  raw?: Partial<Record<MinionStatKey, number | null>> | null,
): MinionBaseStats {
  const d = DEFAULT_MINION_BASE_STATS;
  return {
    strength: Math.max(0, Math.floor(raw?.strength ?? d.strength)),
    agility: Math.max(0, Math.floor(raw?.agility ?? d.agility)),
    intelligence: Math.max(0, Math.floor(raw?.intelligence ?? d.intelligence)),
    endurance: Math.max(0, Math.floor(raw?.endurance ?? d.endurance)),
  };
}

/** 미니언 생성 시 — 전부 0, 레벨업·배분으로만 성장 */
export function rollMinionBaseStats(_rnd = Math.random): MinionBaseStats {
  return { ...DEFAULT_MINION_BASE_STATS };
}

export function minionBaseStatsFromRow(
  row?: Partial<Record<MinionStatKey, number | null>> | null,
): MinionBaseStats {
  return normalizeMinionBaseStats(row);
}
