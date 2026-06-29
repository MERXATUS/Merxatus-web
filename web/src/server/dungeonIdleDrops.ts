import type { DungeonDef } from "@/server/dungeonData";
import { isBaseEquipmentDropItemId, scaleBaseEquipmentDropWeight } from "@/shared/craftingItemDrops";
import { DUNGEON_IDLE_RULES } from "@/shared/dungeonIdle";

type DropRow = DungeonDef["drops"][number];

/** 방치 던전 — 장비 가중치 추가 축소 */
export function idleBalancedDrops(drops: DropRow[]): DropRow[] {
  const factor = DUNGEON_IDLE_RULES.equipmentWeightFactor;
  return drops.map((d) => {
    if (!isBaseEquipmentDropItemId(d.itemId)) return d;
    const weight = Math.max(1, Math.floor(d.weight * factor));
    return { ...d, weight };
  });
}

export function idleRollFloorForStage(stageOrder: number): number {
  const order = Math.max(1, Math.min(8, Math.floor(stageOrder)));
  return order * 10;
}
