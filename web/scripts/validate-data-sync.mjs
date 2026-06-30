/**

 * CSV → JSON 동기화 후 산출물이 비어 있지 않은지 빠르게 검증

 *   node scripts/validate-data-sync.mjs

 */

import { readFile } from "node:fs/promises";

import path from "node:path";



const data = (...p) => path.join(process.cwd(), "data", ...p);

const root = (...p) => path.join(process.cwd(), ...p);



async function readJson(file) {

  return JSON.parse(await readFile(data(file), "utf8"));

}



function assert(cond, msg) {

  if (!cond) throw new Error(msg);

}



async function main() {

  const items = await readJson("items.json");

  const workshops = await readJson("workshops.json");

  const recipes = await readJson("recipes.json");

  const dungeons = await readJson("dungeons.json");

  const raids = await readJson("raids.json");

  const tower = await readJson("tower.json");

  const monsters = await readJson("monsters.json");

  const weapons = await readJson("weapon_stats.json");

  const armor = await readJson("armor_stats.json");

  const enhance = await readJson("weapon_enhance_levels.json");

  const options = await readJson("weapon_option_tiers.json");

  const armorOptions = await readJson("armor_option_tiers.json");

  const boxOpens = await readJson("box_opens.json");
  const dungeonDropTables = await readJson("dungeon_drop_tables.json");
  const raidDropTables = await readJson("raid_drop_tables.json");
  const towerDropTable = await readJson("tower_drop_table.json");



  assert(Array.isArray(items) && items.length >= 25, `items.json: ${items?.length}`);

  assert(Array.isArray(workshops), `workshops.json: ${workshops?.length}`);

  assert(Array.isArray(recipes), `recipes.json: ${recipes?.length}`);

  assert(Array.isArray(dungeons) && dungeons.length >= 8, `dungeons.json: ${dungeons?.length}`);

  assert(Array.isArray(raids) && raids.length === 28, `raids.json: ${raids?.length}`);

  assert(tower?.drops?.length >= 1, "tower.json: drops missing");

  assert(Object.keys(monsters).length >= 28, `monsters.json: ${Object.keys(monsters).length}`);

  assert(Object.keys(weapons).length >= 5, "weapon_stats.json");

  assert(Object.keys(armor).length >= 16, "armor_stats.json");

  assert(enhance.length >= 30, "weapon_enhance_levels.json");

  assert(Object.keys(options).length >= 8, "weapon_option_tiers.json");

  assert(options.STAT_STR_ADD?.tiers?.length === 9, "weapon STAT_STR_ADD");

  assert(Object.keys(armorOptions).length >= 8, "armor_option_tiers.json");

  assert(armorOptions.STAT_INT_ADD?.tiers?.length === 9, "armor STAT_INT_ADD");

  assert(Object.keys(boxOpens).length === 0, `box_opens.json should be empty: ${Object.keys(boxOpens).length}`);

  assert(
    dungeonDropTables && typeof dungeonDropTables === "object" && Object.keys(dungeonDropTables).length >= 8,
    `dungeon_drop_tables.json: ${dungeonDropTables ? Object.keys(dungeonDropTables).length : 0}`,
  );
  for (const d of dungeons) {
    assert(dungeonDropTables[d.id], `dungeon_drop_tables missing: ${d.id}`);
  }

  assert(
    raidDropTables && typeof raidDropTables === "object" && Object.keys(raidDropTables).length === raids.length,
    `raid_drop_tables.json: ${raidDropTables ? Object.keys(raidDropTables).length : 0}`,
  );
  for (const r of raids) {
    assert(raidDropTables[r.id], `raid_drop_tables missing: ${r.id}`);
  }

  assert(
    towerDropTable?.dungeonId && Array.isArray(towerDropTable.sections),
    "tower_drop_table.json missing or invalid",
  );



  const itemIds = new Set(items.map((i) => i.id));

  const requiredItems = [

    "item_raid_shard",
    "item_raid_ticket",

    "item_lesser_mana_stone",

    "item_lesser_mana_stone",
    "item_mana_stone",
    "item_greater_mana_stone",

    "weapon_gold_sword",

    "armor_golden_boots",

  ];

  for (const id of requiredItems) assert(itemIds.has(id), `missing item: ${id}`);



  const forbidden = /^item_box_(mineral|herb|gear)_/;

  for (const id of itemIds) {

    assert(!forbidden.test(id), `legacy box item still in catalog: ${id}`);

  }



  assert(raids.every((r) => r.maxPhases === 1), "each raid should be single-phase boss");

  assert(raids.length === 28, "expected 28 raids (7 demons + 7 angels × normal/hard)");
  assert(raids.some((r) => r.id === "raid_demon_lucifer_normal"), "demon lucifer normal raid");
  assert(raids.some((r) => r.id === "raid_angel_michael_hard"), "angel michael hard raid");
  assert(raids.every((r) => /^raid_(demon|angel)_[a-z0-9]+_(normal|hard)$/.test(r.id)), "raid id format");
  assert(raids.every((r) => r.faction === "demon" || r.faction === "angel"), "raid faction demon/angel only");

  assert(raids.some((r) => r.drops.some((d) => d.itemId === "item_raid_shard")), "raid clear drop");

  assert(

    raids.every((r) => !r.drops.some((d) => forbidden.test(d.itemId))),

    "raid drops must not use legacy boxes",

  );



  for (const d of dungeons) {

    for (const drop of d.drops ?? []) {

      assert(!forbidden.test(drop.itemId), `dungeon ${d.id} legacy box drop: ${drop.itemId}`);

    }

  }



  assert(monsters.wolf && monsters.void_harbinger, "dungeon monsters");



  for (const item of items.filter((i) => i.category === "무기" || i.id.startsWith("weapon_"))) {

    const row = weapons[item.id];

    assert(row, `weapon_stats missing: ${item.id}`);

    assert(item.grade === row.grade, `${item.id} grade items=${item.grade} stats=${row.grade}`);

    assert(item.name === row.name, `${item.id} name mismatch`);

  }



  for (const item of items.filter((i) => i.category === "방어구" || i.id.startsWith("armor_"))) {

    const row = armor[item.id];

    assert(row, `armor_stats missing: ${item.id}`);

    assert(item.grade === row.grade, `${item.id} grade items=${item.grade} stats=${row.grade}`);

    assert(item.name === row.name, `${item.id} name mismatch`);

  }



  const gameRulesSrc = await readFile(root("src", "server", "gameRules.ts"), "utf8");

  for (const [id, w] of Object.entries(weapons)) {

    const expected = Math.max(1, Math.round(w.atk || w.magic || 1));

    const re = new RegExp(`${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(\\d+)`);

    const m = gameRulesSrc.match(re);

    assert(m && Number(m[1]) === expected, `${id} combat power: stats→${expected} gameRules→${m?.[1] ?? "?"}`);

  }



  console.log("OK: CSV ↔ JSON 산출물 검증 통과");

  console.log(`  items=${items.length} workshops=${workshops.length} recipes=${recipes.length}`);

  console.log(`  dungeons=${dungeons.length} raids=${raids.length} monsters=${Object.keys(monsters).length}`);

}



main().catch((e) => {

  console.error("FAIL:", e.message);

  process.exit(1);

});


