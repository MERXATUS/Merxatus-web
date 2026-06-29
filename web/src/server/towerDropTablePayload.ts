import {
  enrichDropTableSection,
  loadDropTableCatalogContext,
  readStaticDataJson,
} from "@/server/dropTablePayloadCore";
import type { TowerDef } from "@/server/towerData";
import { loadTowerConfig } from "@/server/towerData";
import { buildDungeonDropTableSections } from "@/shared/dungeonDropTable";
import type { DungeonDropTablePayloadView } from "@/shared/dungeonDropTableView";

function buildPayloadForTower(
  tower: TowerDef,
  ctx: Awaited<ReturnType<typeof loadDropTableCatalogContext>>,
): DungeonDropTablePayloadView {
  const cycle = Math.max(1, tower.encounterCycleFloors ?? 80);
  const sections = buildDungeonDropTableSections(tower.drops, [], cycle).map((s) =>
    enrichDropTableSection(s, ctx.catalogNames, ctx.iconMap, ctx.itemCategoryById),
  );

  return {
    dungeonId: tower.seasonKey,
    dungeonName: tower.name,
    maxFloors: cycle,
    gearPlanNotes: "층 클리어 시 1회 추첨 · 80층 주기 몬스터 순환",
    sections,
  };
}

let towerDropTableCache: DungeonDropTablePayloadView | null = null;

export function invalidateTowerDropTableCache() {
  towerDropTableCache = null;
}

export async function loadTowerDropTable(opts?: {
  force?: boolean;
}): Promise<DungeonDropTablePayloadView> {
  if (!opts?.force && towerDropTableCache) return towerDropTableCache;

  if (!opts?.force) {
    const fromFile = await readStaticDataJson<DungeonDropTablePayloadView>("tower_drop_table.json");
    if (fromFile) {
      towerDropTableCache = fromFile;
      return fromFile;
    }
  }

  const [tower, ctx] = await Promise.all([loadTowerConfig(), loadDropTableCatalogContext()]);
  const payload = buildPayloadForTower(tower, ctx);
  towerDropTableCache = payload;
  return payload;
}
