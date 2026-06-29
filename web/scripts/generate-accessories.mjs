import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");

const BOSSES = [
  ...[
    ["demon", "lucifer", "[오만]", "루시퍼"],
    ["demon", "leviathan", "[질투]", "레비아탄"],
    ["demon", "satan", "[분노]", "사탄"],
    ["demon", "belphegor", "[나태]", "벨페고르"],
    ["demon", "mammon", "[탐욕]", "마몬"],
    ["demon", "beelzebub", "[식탐]", "바알제붑"],
    ["demon", "asmodeus", "[색욕]", "아스모데우스"],
  ].map(([faction, key, title, name], i) => ({
    faction,
    key,
    title,
    name,
    order: i + 1,
    setId: "demon_raid",
  })),
  ...[
    ["angel", "michael", "[겸손]", "미카엘"],
    ["angel", "raguel", "[친절]", "라구엘"],
    ["angel", "jophiel", "[인내]", "요피엘"],
    ["angel", "gabriel", "[근면]", "가브리엘"],
    ["angel", "raphael", "[자선]", "라파엘"],
    ["angel", "uriel", "[절제]", "우리엘"],
    ["angel", "sariel", "[순결]", "사리엘"],
  ].map(([faction, key, title, name], i) => ({
    faction,
    key,
    title,
    name,
    order: i + 1,
    setId: "angel_raid",
  })),
];

const SLOT_BY_ORDER = {
  1: "ring1",
  2: "ring2",
  3: "necklace",
  4: "necklace2",
  5: "relic",
  6: "relic2",
  7: "relic3",
};

const SLOT_LABEL = {
  ring1: "반지",
  ring2: "반지",
  necklace: "목걸이",
  necklace2: "목걸이",
  relic: "유물",
  relic2: "유물",
  relic3: "유물",
};

const SLOT_KIND = {
  ring1: "ring",
  ring2: "ring",
  necklace: "necklace",
  necklace2: "necklace",
  relic: "relic",
  relic2: "relic",
  relic3: "relic",
};

function contentTier(order, mode) {
  const o = Math.max(1, Math.min(7, order));
  const base = 1 + o;
  const tier = mode === "hard" ? base + 1 : base;
  return Math.max(2, Math.min(8, tier));
}

function baseMods(slotKind, grade, faction) {
  const g = grade;
  const s = (n) => Math.floor(n + g * 1.4);
  if (slotKind === "ring") return { critChancePct: s(2), critDmgPct: s(3) };
  if (slotKind === "necklace") return { dmgReducePct: s(2), regenHpPerRound: Math.max(1, Math.floor(g / 2)) };
  if (faction === "demon") return { dmgVsAngelPct: s(4), finalDmgPct: s(2) };
  return { dmgVsDemonPct: s(4), blockPct: s(2) };
}

const catalog = [];
const newItems = [];

for (const boss of BOSSES) {
  const slot = SLOT_BY_ORDER[boss.order];
  const slotKind = SLOT_KIND[slot];
  const slotLabel = SLOT_LABEL[slot];

  for (const mode of ["normal", "hard"]) {
    const isJin = mode === "hard";
    const suffix = isJin ? "_jin" : "";
    const id = `acc_${boss.faction}_${slotKind}_${boss.key}${suffix}`;
    const grade = contentTier(boss.order, mode);
    const name = isJin
      ? `진 ${boss.title} ${boss.name}의 ${slotLabel}`
      : `${boss.title} ${boss.name}의 ${slotLabel}`;
    const raidId = `raid_${boss.faction}_${boss.key}_${mode}`;

    newItems.push({
      id,
      name,
      category: "악세서리",
      tradable: true,
      grade,
      icon: "Icon_Minion_Ticket",
    });

    catalog.push({
      id,
      name,
      faction: boss.faction,
      setId: boss.setId,
      slot,
      slotKind,
      bossKey: boss.key,
      bossOrder: boss.order,
      isJin,
      grade,
      raidId,
      mods: baseMods(slotKind, grade, boss.faction),
    });
  }
}

const sets = [
  {
    id: "demon_raid",
    faction: "demon",
    label: "7대 죄악",
    bonuses: [
      { count: 2, mods: { finalDmgPct: 8 } },
      { count: 4, mods: { dmgVsAngelPct: 15 } },
      { count: 7, mods: { dmgVsBossPct: 12 } },
    ],
  },
  {
    id: "angel_raid",
    faction: "angel",
    label: "7대 미덕",
    bonuses: [
      { count: 2, mods: { dmgReducePct: 8 } },
      { count: 4, mods: { dmgVsDemonPct: 15 } },
      { count: 7, mods: { regenHpPerRound: 8 } },
    ],
  },
];

writeFileSync(path.join(dataDir, "accessory_catalog.json"), JSON.stringify({ items: catalog, sets }, null, 2) + "\n");

const itemsPath = path.join(dataDir, "items.json");
const items = JSON.parse(readFileSync(itemsPath, "utf8"));
const existing = new Set(items.map((x) => x.id));
for (const it of newItems) {
  if (!existing.has(it.id)) items.push(it);
}
writeFileSync(itemsPath, JSON.stringify(items, null, 2) + "\n");

const raidsPath = path.join(dataDir, "raids.json");
const raids = JSON.parse(readFileSync(raidsPath, "utf8"));
for (const entry of catalog) {
  const raid = raids.find((r) => r.id === entry.raidId);
  if (!raid) continue;
  const has = raid.drops.some((d) => d.itemId === entry.id);
  if (!has) {
    raid.drops.push({
      itemId: entry.id,
      weight: entry.isJin ? 2800 : 2200,
      minQty: 1,
      maxQty: 1,
    });
  }
}
writeFileSync(raidsPath, JSON.stringify(raids, null, 2) + "\n");

console.log(`catalog: ${catalog.length} accessories, items added: ${newItems.length}, sets: ${sets.length}`);
