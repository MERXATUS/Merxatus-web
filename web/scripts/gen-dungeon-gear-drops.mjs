/**
 * dungeon_gear_drops.csv 생성 — 층 구간별 장비 **직접** 드랍 (상자 X)
 *   node scripts/gen-dungeon-gear-drops.mjs
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

const SETS = {
  leather: {
    weapons: ["weapon_wood_sword", "weapon_stone_sword"],
    armor: ["armor_leather_helmet", "armor_leather_armor", "armor_leather_pants", "armor_leather_boots"],
  },
  crimson: {
    weapons: ["weapon_red_gold_sword", "weapon_steel_sword"],
    armor: ["armor_crimson_helmet", "armor_crimson_armor", "armor_crimson_pants", "armor_crimson_boots"],
  },
  iron: {
    weapons: ["weapon_steel_sword", "weapon_gold_sword"],
    armor: ["armor_iron_helmet", "armor_iron_armor", "armor_iron_pants", "armor_iron_boots"],
  },
  golden: {
    weapons: ["weapon_gold_sword"],
    armor: ["armor_golden_helmet", "armor_golden_armor", "armor_golden_pants", "armor_golden_boots"],
  },
};

/** first=1: 스테이지 입장 직후부터 장비 드랍. weaponW/armorW: 초반 스테이지일수록 높게 */
const STAGES = [
  {
    dungeonId: "dungeon_slime_forest",
    set: "leather",
    preview: "crimson",
    first: 1,
    fullMax: 9,
    boss: 10,
    weaponW: 520,
    armorW: 380,
  },
  {
    dungeonId: "dungeon_goblin_den",
    set: "crimson",
    preview: "iron",
    first: 1,
    fullMax: 13,
    boss: 14,
    weaponW: 480,
    armorW: 340,
  },
  {
    dungeonId: "dungeon_wolf_ravine",
    set: "iron",
    preview: "golden",
    first: 1,
    fullMax: 15,
    boss: 16,
    weaponW: 420,
    armorW: 300,
  },
  {
    dungeonId: "dungeon_crypt_of_dead",
    set: "golden",
    preview: null,
    first: 1,
    fullMax: 17,
    boss: 18,
    weaponW: 360,
    armorW: 260,
  },
  {
    dungeonId: "dungeon_scorch_rift",
    set: "golden",
    preview: null,
    first: 1,
    fullMax: 19,
    boss: 20,
    weaponW: 340,
    armorW: 240,
  },
  {
    dungeonId: "dungeon_frost_citadel",
    set: "golden",
    preview: null,
    first: 1,
    fullMax: 21,
    boss: 22,
    weaponW: 320,
    armorW: 220,
  },
  {
    dungeonId: "dungeon_dragon_roost",
    set: "golden",
    preview: null,
    first: 1,
    fullMax: 23,
    boss: 24,
    weaponW: 300,
    armorW: 210,
  },
  {
    dungeonId: "dungeon_void_rift",
    set: "golden",
    preview: null,
    first: 1,
    fullMax: 25,
    boss: 26,
    weaponW: 280,
    armorW: 200,
  },
];

function addRows(rows, dungeonId, items, minFloor, maxFloor, pool, weaponW, armorW) {
  for (const id of items.weapons) {
    rows.push([dungeonId, id, minFloor, maxFloor, weaponW, 1, 1, pool].join(","));
  }
  for (const id of items.armor) {
    rows.push([dungeonId, id, minFloor, maxFloor, armorW, 1, 1, pool].join(","));
  }
}

function addPreview(rows, dungeonId, items, fromFloor, maxFloor, pool) {
  addRows(rows, dungeonId, items, fromFloor, maxFloor, pool, 70, 55);
}

const rows = [
  "# 던전 장비 직접 드랍 — MinFloor~MaxFloor 구간에서만 롤 (Pool: normal | boss)",
  "DungeonId,ItemId,MinFloor,MaxFloor,Weight,MinQty,MaxQty,Pool",
];

for (const st of STAGES) {
  const main = SETS[st.set];
  const previewSet = st.preview ? SETS[st.preview] : null;
  const previewFrom = Math.max(1, st.fullMax - 2);

  addRows(rows, st.dungeonId, main, st.first, st.fullMax, "normal", st.weaponW, st.armorW);
  if (previewSet) addPreview(rows, st.dungeonId, previewSet, previewFrom, st.fullMax, "normal");
  addRows(rows, st.dungeonId, main, st.boss, st.boss, "boss", 950, 750);
  if (previewSet) addPreview(rows, st.dungeonId, previewSet, st.boss, st.boss, "boss");
}

rows.push("dungeon_void_rift,weapon_gold_sword,22,25,120,1,1,normal");
rows.push("dungeon_void_rift,armor_golden_helmet,22,25,90,1,1,normal");
rows.push("dungeon_void_rift,armor_golden_armor,22,25,90,1,1,normal");

const out = path.join(process.cwd(), "data", "csv-templates", "dungeon_gear_drops.csv");
await writeFile(out, rows.join("\n") + "\n", "utf8");
console.log(`OK: ${out} (${rows.length - 2} drop rows)`);
