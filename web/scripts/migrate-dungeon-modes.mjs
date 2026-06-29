import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");

const dungeonsPath = path.join(dataDir, "dungeons.json");
const dungeons = JSON.parse(readFileSync(dungeonsPath, "utf8"));

const stageById = {
  dungeon_slime_forest: 1,
  dungeon_goblin_den: 2,
  dungeon_wolf_ravine: 3,
  dungeon_crypt_of_dead: 4,
  dungeon_scorch_rift: 5,
  dungeon_frost_citadel: 6,
  dungeon_dragon_roost: 7,
  dungeon_void_rift: 8,
};

const special = dungeons.map((d) => {
  const stageOrder = stageById[d.id] ?? 1;
  const { id, ...rest } = d;
  return {
    id: `special_${id.replace(/^dungeon_/, "")}`,
    ...rest,
    mode: "PUSH_LUCK",
    linkedStageOrder: stageOrder,
    ticketItemId: "item_special_dungeon_ticket",
    ticketCost: stageOrder <= 2 ? 1 : stageOrder <= 5 ? 2 : 3,
  };
});

for (const d of dungeons) {
  d.mode = "IDLE";
}

writeFileSync(path.join(dataDir, "special_dungeons.json"), JSON.stringify(special, null, 2) + "\n");
writeFileSync(dungeonsPath, JSON.stringify(dungeons, null, 2) + "\n");
console.log(`Updated ${dungeons.length} dungeons to IDLE, wrote ${special.length} special dungeons`);
