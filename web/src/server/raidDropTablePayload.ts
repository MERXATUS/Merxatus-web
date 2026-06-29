import {
  enrichDropTableSection,
  loadDropTableCatalogContext,
  readStaticDataJson,
} from "@/server/dropTablePayloadCore";
import type { RaidDef } from "@/server/raidData";
import { loadRaids } from "@/server/raidData";
import { buildRaidDropTableSections } from "@/shared/raidDropTable";
import type { DungeonDropTablePayloadView, DungeonDropTablesById } from "@/shared/dungeonDropTableView";

function buildPayloadForRaid(
  raid: RaidDef,
  ctx: Awaited<ReturnType<typeof loadDropTableCatalogContext>>,
): DungeonDropTablePayloadView {
  const sections = buildRaidDropTableSections(raid.phaseDrops ?? [], raid.drops).map((s) =>
    enrichDropTableSection(s, ctx.catalogNames, ctx.iconMap, ctx.itemCategoryById),
  );

  const notes: string[] = [];
  if ((raid.phaseDrops ?? []).length > 0) notes.push("페이즈 클리어 시 1회 추첨");
  if (raid.drops.length > 0) notes.push("레이드 클리어 시 2회 추첨");

  return {
    dungeonId: raid.id,
    dungeonName: raid.name,
    maxFloors: raid.maxPhases,
    gearPlanNotes: notes.length ? notes.join(" · ") : null,
    sections,
  };
}

let allRaidDropTablesCache: DungeonDropTablesById | null = null;

export function invalidateRaidDropTablesCache() {
  allRaidDropTablesCache = null;
}

export async function loadAllRaidDropTables(opts?: {
  force?: boolean;
}): Promise<DungeonDropTablesById> {
  if (!opts?.force && allRaidDropTablesCache) return allRaidDropTablesCache;

  if (!opts?.force) {
    const fromFile = await readStaticDataJson<DungeonDropTablesById>("raid_drop_tables.json");
    if (fromFile) {
      allRaidDropTablesCache = fromFile;
      return fromFile;
    }
  }

  const [{ raids }, ctx] = await Promise.all([loadRaids(), loadDropTableCatalogContext()]);
  const byId: DungeonDropTablesById = {};
  for (const raid of raids) {
    byId[raid.id] = buildPayloadForRaid(raid, ctx);
  }

  allRaidDropTablesCache = byId;
  return byId;
}
