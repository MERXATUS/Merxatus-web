/** PUSH_LUCK 층 구간별 드랍 수량 배수 (CSV 밸런스 전 기본값) */
export function pushLuckLootMultiplier(floor: number): number {
  const f = Math.max(1, Math.floor(floor));
  if (f <= 5) return 1;
  if (f <= 10) return 1.5;
  if (f <= 15) return 2;
  if (f <= 19) return 2.5;
  return 3;
}

/** 층 클리어 골드 (스테이지 order 반영) */
export function pushLuckFloorGoldReward(floor: number, stageOrder: number): number {
  const f = Math.max(1, Math.floor(floor));
  const stage = Math.max(1, Math.floor(stageOrder));
  const base = 8 + stage * 4;
  return Math.floor(base * f * pushLuckLootMultiplier(f) * 0.25);
}

export function scaleLootEntries<T extends { qty: number }>(
  entries: T[],
  multiplier: number,
): T[] {
  const m = Math.max(1, multiplier);
  return entries.map((e) => ({
    ...e,
    qty: Math.max(1, Math.floor(e.qty * m)),
  }));
}
