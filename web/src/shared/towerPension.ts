/** 무탑 주간 연금 — 펀치킹식 최고 층 기록 + 일일 골드 */
export const TOWER_PENSION_RULES = {
  baseGoldPerDay: 40,
  goldPerFloorExponent: 0.72,
  dailyClaimCapGold: 50_000,
} as const;

/** UTC 기준 ISO 주차 키 — 해당 주 월요일 YYYY-MM-DD */
export function towerWeekKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function towerPensionDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function towerDailyPensionGold(floor: number): number {
  const f = Math.max(0, Math.floor(floor));
  if (f <= 0) return 0;
  const raw =
    TOWER_PENSION_RULES.baseGoldPerDay *
    Math.pow(f, TOWER_PENSION_RULES.goldPerFloorExponent);
  return Math.min(TOWER_PENSION_RULES.dailyClaimCapGold, Math.max(1, Math.floor(raw)));
}
