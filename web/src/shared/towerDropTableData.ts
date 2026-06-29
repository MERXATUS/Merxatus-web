import towerDropTableJson from "../../data/tower_drop_table.json";
import type { DungeonDropTablePayloadView } from "@/shared/dungeonDropTableView";

export const TOWER_DROP_TABLE = towerDropTableJson as DungeonDropTablePayloadView;

export function towerDropTable(): DungeonDropTablePayloadView {
  return TOWER_DROP_TABLE;
}
