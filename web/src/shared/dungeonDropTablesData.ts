import dropTablesJson from "../../data/dungeon_drop_tables.json";
import type { DungeonDropTablePayloadView, DungeonDropTablesById } from "@/shared/dungeonDropTableView";
import { normalizeItemIdLower } from "@/shared/itemId";

export const DUNGEON_DROP_TABLES = dropTablesJson as DungeonDropTablesById;

export function dungeonDropTableForId(dungeonId: string | null | undefined): DungeonDropTablePayloadView | null {
  const id = normalizeItemIdLower(dungeonId);
  if (!id) return null;
  return DUNGEON_DROP_TABLES[id] ?? null;
}
