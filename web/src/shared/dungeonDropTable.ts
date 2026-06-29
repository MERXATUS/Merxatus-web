export type DungeonDropRowInput = {
  itemId: string;
  weight: number;
  minQty: number;
  maxQty: number;
  minFloor?: number;
  maxFloor?: number;
};

export type DungeonDropTableRow = {
  itemId: string;
  weight: number;
  chancePct: number;
  minQty: number;
  maxQty: number;
  floorMin: number;
  floorMax: number;
  floorLabel: string;
};

export type DungeonDropTableSection = {
  id: string;
  label: string;
  kind: "normal" | "boss";
  floorMin: number;
  floorMax: number;
  rows: DungeonDropTableRow[];
};

function poolAtFloor(drops: DungeonDropRowInput[], floor: number): DungeonDropRowInput[] {
  const f = Math.max(1, Math.floor(floor));
  return drops.filter((d) => {
    const minF = d.minFloor ?? 1;
    const maxF = d.maxFloor ?? Number.MAX_SAFE_INTEGER;
    return minF <= f && f <= maxF;
  });
}

function chancePct(weight: number, pool: DungeonDropRowInput[]): number {
  const total = pool.reduce((s, d) => s + Math.max(0, d.weight), 0);
  if (total <= 0) return 0;
  return (weight / total) * 100;
}

function floorRangeLabel(minF: number, maxF: number, maxFloors: number, boss: boolean): string {
  if (boss) return `${minF}층 보스`;
  const cap = Math.max(1, maxFloors);
  const hi = maxF >= cap || maxF >= Number.MAX_SAFE_INTEGER / 2 ? cap : maxF;
  if (minF === 1 && hi >= cap) return `1~${cap}층`;
  if (minF === hi) return `${minF}층`;
  return `${minF}~${hi}층`;
}

function rowFloorBounds(d: DungeonDropRowInput, maxFloors: number, boss: boolean) {
  const cap = Math.max(1, Math.floor(maxFloors));
  const minF = Math.max(1, Math.floor(d.minFloor ?? (boss ? cap : 1)));
  const rawMax = d.maxFloor ?? (boss ? cap : cap);
  const maxF = Math.min(cap, Math.floor(rawMax));
  return { minF, maxF: Math.max(minF, maxF) };
}

/** 층 구간별 드랍표 — 구간 시작 층 풀 기준 확률 */
export function buildDungeonDropTableSections(
  drops: DungeonDropRowInput[],
  bossDrops: DungeonDropRowInput[],
  maxFloors: number,
): DungeonDropTableSection[] {
  const cap = Math.max(1, Math.floor(maxFloors));
  const bossFloor = cap;
  const normalCeiling = bossDrops.length > 0 ? cap - 1 : cap;

  const breakpoints = new Set<number>([1]);
  for (const d of drops) {
    const minF = d.minFloor ?? 1;
    if (minF >= 1 && minF <= normalCeiling) breakpoints.add(minF);
  }
  const sorted = [...breakpoints].sort((a, b) => a - b);
  const sections: DungeonDropTableSection[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const floorMin = sorted[i]!;
    const next = sorted[i + 1];
    const floorMax = next != null ? Math.min(normalCeiling, next - 1) : normalCeiling;
    if (floorMin > normalCeiling) continue;

    const sampleFloor = floorMin;
    const pool = poolAtFloor(drops, sampleFloor);
    const label =
      floorMin === floorMax
        ? `일반 ${floorMin}층`
        : `일반 ${floorMin}~${floorMax}층`;

    const rows: DungeonDropTableRow[] = pool
      .map((d) => {
        const { minF, maxF } = rowFloorBounds(d, cap, false);
        return {
          itemId: d.itemId,
          weight: d.weight,
          chancePct: chancePct(d.weight, pool),
          minQty: d.minQty,
          maxQty: d.maxQty,
          floorMin: minF,
          floorMax: maxF,
          floorLabel: floorRangeLabel(minF, maxF, cap, false),
        };
      })
      .sort((a, b) => b.chancePct - a.chancePct || a.itemId.localeCompare(b.itemId, "ko"));

    sections.push({
      id: `normal-${floorMin}-${floorMax}`,
      label,
      kind: "normal",
      floorMin,
      floorMax,
      rows,
    });
  }

  if (bossDrops.length > 0) {
    const pool = poolAtFloor(bossDrops, bossFloor);
    const rows: DungeonDropTableRow[] = bossDrops
      .map((d) => {
        const { minF, maxF } = rowFloorBounds(d, cap, true);
        return {
          itemId: d.itemId,
          weight: d.weight,
          chancePct: chancePct(d.weight, pool),
          minQty: d.minQty,
          maxQty: d.maxQty,
          floorMin: minF,
          floorMax: maxF,
          floorLabel: floorRangeLabel(minF, maxF, cap, true),
        };
      })
      .sort((a, b) => b.chancePct - a.chancePct || a.itemId.localeCompare(b.itemId, "ko"));

    sections.push({
      id: `boss-${bossFloor}`,
      label: `${bossFloor}층 보스`,
      kind: "boss",
      floorMin: bossFloor,
      floorMax: bossFloor,
      rows,
    });
  }

  return sections.filter((s) => s.rows.length > 0);
}

export function formatDropChancePct(pct: number): string {
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  if (pct >= 0.1) return `${pct.toFixed(2)}%`;
  if (pct > 0) return `${pct.toFixed(3)}%`;
  return "0%";
}

export function formatDropQty(minQty: number, maxQty: number): string {
  if (minQty === maxQty) return `${minQty}`;
  return `${minQty}~${maxQty}`;
}
