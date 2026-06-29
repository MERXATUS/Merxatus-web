/**
 * 장비 표시명 — 에셋(재질) 기준 + 세트명 동기화
 * node scripts/patch-equipment-material-names.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const WEAPONS = {
  weapon_wood_sword: "나무 검",
  weapon_stone_sword: "돌 검",
  weapon_red_gold_sword: "적빛 검",
  weapon_steel_sword: "철 검",
  weapon_gold_sword: "심판 검",
  weapon_diamond_sword: "천광 검",
};

const ARMOR = {
  armor_leather_helmet: "가죽 투구",
  armor_leather_armor: "가죽 갑옷",
  armor_leather_pants: "가죽 각반",
  armor_leather_boots: "가죽 장화",
  armor_chain_helmet: "사슬 투구",
  armor_chain_armor: "사슬 갑옷",
  armor_chain_pants: "사슬 각반",
  armor_chain_boots: "사슬 장화",
  armor_crimson_helmet: "적빛 투구",
  armor_crimson_armor: "적빛 갑옷",
  armor_crimson_pants: "적빛 각반",
  armor_crimson_boots: "적빛 장화",
  armor_iron_helmet: "철 투구",
  armor_iron_armor: "철 갑옷",
  armor_iron_pants: "철 각반",
  armor_iron_boots: "철 장화",
  armor_golden_helmet: "심판 투구",
  armor_golden_armor: "심판 흉갑",
  armor_golden_pants: "심판 각반",
  armor_golden_boots: "심판 장화",
  armor_diamond_helmet: "천광 왕관",
  armor_diamond_armor: "천광 흉갑",
  armor_diamond_pants: "천광 각갑",
  armor_diamond_boots: "천광 장화",
};

const CSV_WEAPON = {
  Weapon_Wood_Sword: "weapon_wood_sword",
  Weapon_Stone_Sword: "weapon_stone_sword",
  Weapon_Red_Gold_Sword: "weapon_red_gold_sword",
  Weapon_Steel_Sword: "weapon_steel_sword",
  Weapon_Gold_Sword: "weapon_gold_sword",
  Weapon_Diamond_Sword: "weapon_diamond_sword",
};

const CSV_ARMOR = {
  Armor_Leather_Helmet: "armor_leather_helmet",
  Armor_Leather_Armor: "armor_leather_armor",
  Armor_Leather_Pants: "armor_leather_pants",
  Armor_Leather_Boots: "armor_leather_boots",
  Armor_Chain_Helmet: "armor_chain_helmet",
  Armor_Chain_Armor: "armor_chain_armor",
  Armor_Chain_Pants: "armor_chain_pants",
  Armor_Chain_Boots: "armor_chain_boots",
  Armor_Crimson_Helmet: "armor_crimson_helmet",
  Armor_Crimson_Armor: "armor_crimson_armor",
  Armor_Crimson_Pants: "armor_crimson_pants",
  Armor_Crimson_Boots: "armor_crimson_boots",
  Armor_Iron_Helmet: "armor_iron_helmet",
  Armor_Iron_Armor: "armor_iron_armor",
  Armor_Iron_Pants: "armor_iron_pants",
  Armor_Iron_Boots: "armor_iron_boots",
  Armor_Golden_Helmet: "armor_golden_helmet",
  Armor_Golden_Armor: "armor_golden_armor",
  Armor_Golden_Pants: "armor_golden_pants",
  Armor_Golden_Boots: "armor_golden_boots",
  Armor_Diamond_Helmet: "armor_diamond_helmet",
  Armor_Diamond_Armor: "armor_diamond_armor",
  Armor_Diamond_Pants: "armor_diamond_pants",
  Armor_Diamond_Boots: "armor_diamond_boots",
};

async function patchJson(rel, map) {
  const p = path.join(root, rel);
  const data = JSON.parse(await readFile(p, "utf8"));
  for (const [id, name] of Object.entries(map)) {
    if (data[id]) data[id].name = name;
  }
  await writeFile(p, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function patchItemsJson() {
  const p = path.join(root, "data/items.json");
  const items = JSON.parse(await readFile(p, "utf8"));
  for (const it of items) {
    const n = WEAPONS[it.id] ?? ARMOR[it.id];
    if (n) it.name = n;
  }
  await writeFile(p, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

async function patchCsv(rel, idMap, nameMap) {
  const p = path.join(root, rel);
  const lines = (await readFile(p, "utf8")).trim().split(/\r?\n/);
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const csvId = cols[0]?.trim();
    const itemId = idMap[csvId];
    if (itemId && nameMap[itemId]) cols[1] = nameMap[itemId];
    out.push(cols.join(","));
  }
  await writeFile(p, `${out.join("\n")}\n`, "utf8");
}

await patchJson("data/weapon_stats.json", WEAPONS);
await patchJson("data/armor_stats.json", ARMOR);
await patchItemsJson();
await patchCsv("data/csv-templates/weapons.csv", CSV_WEAPON, WEAPONS);
await patchCsv("data/csv-templates/armor.csv", CSV_ARMOR, ARMOR);
console.log("patch-equipment-material-names: ok");
