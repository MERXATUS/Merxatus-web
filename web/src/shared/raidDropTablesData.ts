import dropTablesJson from "../../data/raid_drop_tables.json";
import type { DungeonDropTablePayloadView, DungeonDropTablesById } from "@/shared/dungeonDropTableView";
import { normalizeItemIdLower } from "@/shared/itemId";

export const RAID_DROP_TABLES = dropTablesJson as DungeonDropTablesById;

export function raidDropTableForId(raidId: string | null | undefined): DungeonDropTablePayloadView | null {
  const id = normalizeItemIdLower(raidId);
  if (!id) return null;
  return RAID_DROP_TABLES[id] ?? null;
}
