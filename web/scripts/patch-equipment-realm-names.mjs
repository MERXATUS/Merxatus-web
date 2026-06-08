/**
 * 장비 세트·표시명 — 천·마·이계 톤 동기화
 * node scripts/patch-equipment-realm-names.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const SET_META = {
  pioneer: {
    name: "오염침식",
    tagline: "마계 균열에 스며든 첫 장갑",
    weapon: "오염침식 균열검",
    armor: {
      helmet: "오염침식 두건",
      armor: "오염침식 조끼",
      pants: "오염침식 각반",
      boots: "오염침식 장화",
    },
  },
  flint: {
    name: "피혈석",
    tagline: "피에 젖은 돌날",
    weapon: "피혈석 파쇄검",
  },
  escort: {
    name: "군번철",
    tagline: "마계 군번의 쇠사슬",
    armor: {
      helmet: "군번철 사슬투구",
      armor: "군번철 사슬갑주",
      pants: "군번철 사슬각반",
      boots: "군번철 사슬장화",
    },
  },
  dawn: {
    name: "마염추적",
    tagline: "마염을 쫓는 붉은 갑주",
    weapon: "마염추적 혈검",
    armor: {
      helmet: "마염추적 투구",
      armor: "마염추적 갑주",
      pants: "마염추적 각반",
      boots: "마염추적 장화",
    },
  },
  oath: {
    name: "피의서약",
    tagline: "피로 맺은 강철 맹세",
    weapon: "피의서약 맹검",
    armor: {
      helmet: "피의서약 투구",
      armor: "피의서약 갑주",
      pants: "피의서약 각반",
      boots: "피의서약 장화",
    },
  },
  royal: {
    name: "낙천자",
    tagline: "추락한 천사의 잔광",
    weapon: "낙천자 성검",
    armor: {
      helmet: "낙천자 투구",
      armor: "낙천자 갑주",
      pants: "낙천자 각반",
      boots: "낙천자 장화",
    },
  },
  throne: {
    name: "심판좌",
    tagline: "빛이 식은 심판의 좌",
    weapon: "심판좌 광검",
    armor: {
      helmet: "심판좌 왕관",
      armor: "심판좌 흉갑",
      pants: "심판좌 각갑",
      boots: "심판좌 전승화",
    },
  },
};

const WEAPON_IDS = {
  weapon_wood_sword: "pioneer",
  weapon_stone_sword: "flint",
  weapon_red_gold_sword: "dawn",
  weapon_steel_sword: "oath",
  weapon_gold_sword: "royal",
  weapon_diamond_sword: "throne",
};

const ARMOR_IDS = {
  armor_leather_helmet: ["pioneer", "helmet"],
  armor_leather_armor: ["pioneer", "armor"],
  armor_leather_pants: ["pioneer", "pants"],
  armor_leather_boots: ["pioneer", "boots"],
  armor_chain_helmet: ["escort", "helmet"],
  armor_chain_armor: ["escort", "armor"],
  armor_chain_pants: ["escort", "pants"],
  armor_chain_boots: ["escort", "boots"],
  armor_crimson_helmet: ["dawn", "helmet"],
  armor_crimson_armor: ["dawn", "armor"],
  armor_crimson_pants: ["dawn", "pants"],
  armor_crimson_boots: ["dawn", "boots"],
  armor_iron_helmet: ["oath", "helmet"],
  armor_iron_armor: ["oath", "armor"],
  armor_iron_pants: ["oath", "pants"],
  armor_iron_boots: ["oath", "boots"],
  armor_golden_helmet: ["royal", "helmet"],
  armor_golden_armor: ["royal", "armor"],
  armor_golden_pants: ["royal", "pants"],
  armor_golden_boots: ["royal", "boots"],
  armor_diamond_helmet: ["throne", "helmet"],
  armor_diamond_armor: ["throne", "armor"],
  armor_diamond_pants: ["throne", "pants"],
  armor_diamond_boots: ["throne", "boots"],
};

async function patchWeaponStats() {
  const p = path.join(root, "data/weapon_stats.json");
  const data = JSON.parse(await readFile(p, "utf8"));
  for (const [id, setKey] of Object.entries(WEAPON_IDS)) {
    if (data[id]) data[id].name = SET_META[setKey].weapon;
  }
  await writeFile(p, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function patchArmorStats() {
  const p = path.join(root, "data/armor_stats.json");
  const data = JSON.parse(await readFile(p, "utf8"));
  for (const [id, [setKey, slot]] of Object.entries(ARMOR_IDS)) {
    if (data[id]) data[id].name = SET_META[setKey].armor[slot];
  }
  await writeFile(p, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function patchItemsJson() {
  const p = path.join(root, "data/items.json");
  const items = JSON.parse(await readFile(p, "utf8"));
  for (const it of items) {
    const w = WEAPON_IDS[it.id];
    if (w) {
      it.name = SET_META[w].weapon;
      continue;
    }
    const a = ARMOR_IDS[it.id];
    if (a) it.name = SET_META[a[0]].armor[a[1]];
  }
  await writeFile(p, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

async function patchCsvWeapons() {
  const p = path.join(root, "data/csv-templates/weapons.csv");
  const lines = (await readFile(p, "utf8")).trim().split(/\r?\n/);
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const id = cols[0]?.trim();
    for (const [csvId, jsonId] of Object.entries({
      Weapon_Wood_Sword: "weapon_wood_sword",
      Weapon_Stone_Sword: "weapon_stone_sword",
      Weapon_Red_Gold_Sword: "weapon_red_gold_sword",
      Weapon_Steel_Sword: "weapon_steel_sword",
      Weapon_Gold_Sword: "weapon_gold_sword",
      Weapon_Diamond_Sword: "weapon_diamond_sword",
    })) {
      if (id === csvId) cols[1] = SET_META[WEAPON_IDS[jsonId]].weapon;
    }
    out.push(cols.join(","));
  }
  await writeFile(p, `${out.join("\n")}\n`, "utf8");
}

async function patchCsvArmor() {
  const p = path.join(root, "data/csv-templates/armor.csv");
  const lines = (await readFile(p, "utf8")).trim().split(/\r?\n/);
  const csvToId = {
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
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const csvId = cols[0]?.trim();
    const itemId = csvToId[csvId];
    if (itemId && ARMOR_IDS[itemId]) {
      const [setKey, slot] = ARMOR_IDS[itemId];
      cols[1] = SET_META[setKey].armor[slot];
    }
    out.push(cols.join(","));
  }
  await writeFile(p, `${out.join("\n")}\n`, "utf8");
}

await patchWeaponStats();
await patchArmorStats();
await patchItemsJson();
await patchCsvWeapons();
await patchCsvArmor();
console.log("patch-equipment-realm-names: ok");
