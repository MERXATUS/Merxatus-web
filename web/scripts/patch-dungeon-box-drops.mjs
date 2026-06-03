/**
 * dungeons.json 드랍을 스테이지 상자·마석 중심으로 패치 (1회성 / 재실행 가능)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dungeonsPath = path.join(__dirname, "../data/dungeons.json");

const STAGE_BY_ID = {
  dungeon_slime_forest: 1,
  dungeon_goblin_den: 2,
  dungeon_wolf_ravine: 3,
  dungeon_crypt_of_dead: 4,
  dungeon_scorch_rift: 5,
  dungeon_frost_citadel: 6,
  dungeon_dragon_roost: 7,
  dungeon_void_rift: 8,
};

function boxTier(stageOrder) {
  const s = Math.max(1, Math.min(8, stageOrder));
  if (s <= 2) return 1;
  if (s <= 4) return 2;
  if (s <= 6) return 3;
  if (s <= 7) return 4;
  return 5;
}

function manaId(stageOrder) {
  if (stageOrder <= 2) return "item_lesser_mana_stone";
  if (stageOrder <= 5) return "item_mana_stone";
  return "item_greater_mana_stone";
}

function dropsFor(stageOrder, boss) {
  const t = boxTier(stageOrder);
  const mineral = `item_box_mineral_t${t}`;
  const herb = `item_box_herb_t${t}`;
  const mana = manaId(stageOrder);
  const mult = boss ? 2 : 1;
  return [
    { itemId: mineral, weight: 4500, minQty: mult, maxQty: mult + (boss ? 2 : 0) },
    { itemId: herb, weight: 4500, minQty: mult, maxQty: mult + (boss ? 1 : 0) },
    { itemId: mana, weight: 3000, minQty: boss ? 2 : 1, maxQty: boss ? 4 : 2 },
  ];
}

const raw = JSON.parse(fs.readFileSync(dungeonsPath, "utf8"));
for (const d of raw) {
  const stage = STAGE_BY_ID[d.id] ?? 1;
  d.drops = dropsFor(stage, false);
  d.bossDrops = dropsFor(stage, true);
}
fs.writeFileSync(dungeonsPath, `${JSON.stringify(raw, null, 2)}\n`);
console.log("patched", raw.length, "dungeons");
