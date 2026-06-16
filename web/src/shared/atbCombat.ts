/** ATB(Active Time Battle) — 게이지·포지션·클라 스냅샷 */

export type AtbRow = "front" | "mid" | "back";

export const ATB_ROW_ORDER: AtbRow[] = ["front", "mid", "back"];

export const ATB_ROW_LABEL: Record<AtbRow, string> = {
  front: "전열",
  mid: "중열",
  back: "후열",
};

/** 행동 게이지 상한 — 레거시 마이그레이션용 */
export const ATB_GAUGE_MAX = 100;

/** @deprecated 공속 쿨다운 전환. parseAtbState 마이그레이션만 사용 */
export const ATB_GAUGE_READY = ATB_GAUGE_MAX - 0.05;

/** @deprecated */
export function atbGaugeIsReady(gauge: number): boolean {
  return gauge >= ATB_GAUGE_READY;
}

/** @deprecated */
export function atbGaugeForSnapshot(gauge: number): number {
  return Math.min(ATB_GAUGE_MAX, Math.round(gauge * 10) / 10);
}

/** @deprecated 게이지 충전 속도. atbAttackIntervalMs 사용 */
export function atbGaugeSpeedPerSec(agility: number, atkSpdPct: number): number {
  return ATB_GAUGE_MAX * atbActionsPerSec(agility, atkSpdPct);
}

/** 공격 1회 쿨다운(ms) — 민첩·공속·배율 반영 */
export function atbAttackIntervalMs(agility: number, atkSpdPct: number, speedMult = 1): number {
  const aps = atbActionsPerSec(agility, atkSpdPct) * Math.max(0.25, speedMult);
  return 1000 / Math.max(0.125, aps);
}

/** 초당 공격 횟수 (UI 표시용) */
export function atbAttacksPerSecView(agility: number, atkSpdPct: number, speedMult = 1): number {
  return Math.round(atbActionsPerSec(agility, atkSpdPct) * Math.max(0.25, speedMult) * 10) / 10;
}

/** 클라→서버 tick 권장 간격(ms) */
export const ATB_CLIENT_TICK_MS = 100;

/** tick 1회 최대 진행(ms) — 남용 방지 */
export const ATB_MAX_DT_MS = 500;

/** 전투 최대 길이(ms) — 무한 루프 방지 */
export const ATB_MAX_ELAPSED_MS = 120_000;

/** 민첩 5당 초당 행동 +1 (민첩 0 = 기본 1회/초) */
export const ATB_REF_AGILITY = 5;

/** 초당 행동 상한 (게이지 100% × N) */
export const ATB_MAX_ACTIONS_PER_SEC = 8;

/**
 * 초당 행동 횟수
 * - 기본 1회/초 (민첩 0 · 공속 0)
 * - 민첩 5마다 +1회/초
 * - 공속(ATK_SPD_PCT) 100 = 배율 ×2
 */
export function atbActionsPerSec(agility: number, atkSpdPct: number): number {
  const agi = Math.max(0, Math.floor(agility));
  const fromAgi = 1 + agi / ATB_REF_AGILITY;
  const spdMult = 1 + Math.max(0, atkSpdPct) / 100;
  return Math.min(ATB_MAX_ACTIONS_PER_SEC, fromAgi * spdMult);
}

export type AtbFloatKind = "damage" | "heal" | "lifesteal" | "blocked" | "miss";

export type AtbCombatEvent = {
  seq: number;
  kind: "action" | "hit" | "heal" | "skill" | "ko" | "extra" | "phase_change";
  actorId: string;
  targetId?: string;
  amount?: number;
  floatKind?: AtbFloatKind;
  crit?: boolean;
  phaseLabel?: string;
};

export type AtbFighterView = {
  id: string;
  label: string;
  side: "party" | "enemy";
  row?: AtbRow;
  hp: number;
  maxHp: number;
  /** 초당 공격 횟수 (표시·디버그) */
  attacksPerSec: number;
  dead: boolean;
};

export type AtbCombatSnapshot = {
  elapsedMs: number;
  fighters: AtbFighterView[];
  outcome: "WIN" | "LOSS" | null;
  events: AtbCombatEvent[];
  phase?: number;
  enemyName?: string;
  bossSubPhase?: number;
  bossPhaseLabel?: string | null;
};

export const BOSS_SUB_PHASE_LABELS: Record<number, string> = {
  1: "1페이즈",
  2: "2페이즈 — 분노",
  3: "3페이즈 — 광폭",
};

/** 레이드 파티 — 내구(endurance) 높은 순 전열→중열→후열 */
export function assignRaidRows(
  members: Array<{ minionId: string; endurance: number }>,
): Map<string, AtbRow> {
  const sorted = [...members].sort((a, b) => b.endurance - a.endurance);
  const out = new Map<string, AtbRow>();
  sorted.forEach((m, i) => {
    out.set(m.minionId, ATB_ROW_ORDER[i] ?? "back");
  });
  return out;
}
