/**
 * dungeons / raids / tower → UI용 드랍표 정적 JSON
 *
 *   npx tsx scripts/gen-drop-tables.ts
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadAllDungeonDropTables } from "../src/server/dungeonDropTablePayload";
import { loadAllRaidDropTables } from "../src/server/raidDropTablePayload";
import { loadTowerDropTable } from "../src/server/towerDropTablePayload";

async function main() {
  const dataDir = path.join(process.cwd(), "data");
  const [dungeons, raids, tower] = await Promise.all([
    loadAllDungeonDropTables({ force: true }),
    loadAllRaidDropTables({ force: true }),
    loadTowerDropTable({ force: true }),
  ]);

  await Promise.all([
    writeFile(path.join(dataDir, "dungeon_drop_tables.json"), `${JSON.stringify(dungeons, null, 2)}\n`, "utf8"),
    writeFile(path.join(dataDir, "raid_drop_tables.json"), `${JSON.stringify(raids, null, 2)}\n`, "utf8"),
    writeFile(path.join(dataDir, "tower_drop_table.json"), `${JSON.stringify(tower, null, 2)}\n`, "utf8"),
  ]);

  console.log(`Wrote ${path.join(dataDir, "dungeon_drop_tables.json")} (${Object.keys(dungeons).length} dungeons)`);
  console.log(`Wrote ${path.join(dataDir, "raid_drop_tables.json")} (${Object.keys(raids).length} raids)`);
  console.log(`Wrote ${path.join(dataDir, "tower_drop_table.json")} (${tower.dungeonName})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
