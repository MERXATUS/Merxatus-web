import type { DungeonDropRowInput, DungeonDropTableSection } from "@/shared/dungeonDropTable";

function chancePct(weight: number, pool: DungeonDropRowInput[]): number {
  const total = pool.reduce((s, d) => s + Math.max(0, d.weight), 0);
  if (total <= 0) return 0;
  return (weight / total) * 100;
}

/** 층·페이즈 구분 없는 단일 가중치 풀 */
export function buildSimpleDropPoolSection(
  drops: DungeonDropRowInput[],
  opts: {
    id: string;
    label: string;
    kind: "normal" | "boss";
    floorLabel: string;
    floorMin?: number;
    floorMax?: number;
  },
): DungeonDropTableSection | null {
  const pool = drops.filter((d) => d.weight > 0);
  if (!pool.length) return null;

  const floorMin = opts.floorMin ?? 1;
  const floorMax = opts.floorMax ?? floorMin;
  const rows = pool
    .map((d) => ({
      itemId: d.itemId,
      weight: d.weight,
      chancePct: chancePct(d.weight, pool),
      minQty: d.minQty,
      maxQty: d.maxQty,
      floorMin,
      floorMax,
      floorLabel: opts.floorLabel,
    }))
    .sort((a, b) => b.chancePct - a.chancePct || a.itemId.localeCompare(b.itemId, "ko"));

  return {
    id: opts.id,
    label: opts.label,
    kind: opts.kind,
    floorMin,
    floorMax,
    rows,
  };
}
