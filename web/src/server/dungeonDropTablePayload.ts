import type { DungeonDef } from "@/server/dungeonData";

import { loadDungeons } from "@/server/dungeonData";

import {

  enrichDropTableSection,

  loadDropTableCatalogContext,

  readStaticDataJson,

} from "@/server/dropTablePayloadCore";

import { gearPlanForDungeonId } from "@/shared/gearDropPlan";

import { buildDungeonDropTableSections } from "@/shared/dungeonDropTable";

import type {

  DungeonDropTableEntryView,

  DungeonDropTablePayloadView,

  DungeonDropTablesById,

} from "@/shared/dungeonDropTableView";



export type {

  DungeonDropTableEntryView,

  DungeonDropTablePayloadView,

  DungeonDropTableSectionView,

} from "@/shared/dungeonDropTableView";



function buildPayloadForDungeon(

  dungeon: DungeonDef,

  ctx: Awaited<ReturnType<typeof loadDropTableCatalogContext>>,

): DungeonDropTablePayloadView {

  const plan = gearPlanForDungeonId(dungeon.id);

  const sections = buildDungeonDropTableSections(

    dungeon.drops,

    dungeon.bossDrops ?? [],

    dungeon.maxFloors ?? 20,

  ).map((s) => enrichDropTableSection(s, ctx.catalogNames, ctx.iconMap, ctx.itemCategoryById));



  return {

    dungeonId: dungeon.id,

    dungeonName: dungeon.name,

    maxFloors: dungeon.maxFloors ?? 20,

    gearPlanNotes: plan?.notes ?? null,

    sections,

  };

}



let allDropTablesCache: DungeonDropTablesById | null = null;



export function invalidateDungeonDropTablesCache() {

  allDropTablesCache = null;

}



export async function loadAllDungeonDropTables(opts?: {

  force?: boolean;

}): Promise<DungeonDropTablesById> {

  if (!opts?.force && allDropTablesCache) return allDropTablesCache;



  if (!opts?.force) {

    const fromFile = await readStaticDataJson<DungeonDropTablesById>("dungeon_drop_tables.json");

    if (fromFile) {

      allDropTablesCache = fromFile;

      return fromFile;

    }

  }



  const [{ dungeons }, ctx] = await Promise.all([loadDungeons(), loadDropTableCatalogContext()]);



  const byId: DungeonDropTablesById = {};

  for (const dungeon of dungeons) {

    byId[dungeon.id] = buildPayloadForDungeon(dungeon, ctx);

  }



  allDropTablesCache = byId;

  return byId;

}



export async function buildDungeonDropTablePayload(dungeon: DungeonDef) {

  const tables = await loadAllDungeonDropTables();

  if (tables[dungeon.id]) return tables[dungeon.id]!;

  const ctx = await loadDropTableCatalogContext();

  return buildPayloadForDungeon(dungeon, ctx);

}


