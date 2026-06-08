/**
 * 하·중·상급 강화 주문서 제거 — 드랍·상점·items.json 정리, 마석 가중치 병합
 * node scripts/patch-remove-enhance-scrolls.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const SCROLL_CSV_TO_MANA = {
  Item_Enhance_Scroll_Low: "Item_Lesser_Mana_Stone",
  Item_Enhance_Scroll_Mid: "Item_Mana_Stone",
  Item_Enhance_Scroll_High: "Item_Greater_Mana_Stone",
};

const REMOVE_ITEM_IDS = new Set([
  "item_enhance_scroll_low",
  "item_enhance_scroll_mid",
  "item_enhance_scroll_high",
]);

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = (cols[i] ?? "").trim();
    return row;
  });
  return { header, rows };
}

function mergeDropRows(rows, keyFields) {
  const map = new Map();
  for (const raw of rows) {
    const itemId = raw.ItemId ?? raw.itemId ?? "";
    const mapped = SCROLL_CSV_TO_MANA[itemId] ?? itemId;
    const row = SCROLL_CSV_TO_MANA[itemId] ? { ...raw, ItemId: mapped } : raw;

    const key = keyFields.map((f) => row[f] ?? "").join("\0") + "\0" + mapped;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row, ItemId: mapped });
      continue;
    }
    existing.Weight = String(Number(existing.Weight || 0) + Number(row.Weight || 0));
    existing.MinQty = String(Math.max(Number(existing.MinQty || 0), Number(row.MinQty || 0)));
    existing.MaxQty = String(Math.max(Number(existing.MaxQty || 0), Number(row.MaxQty || 0)));
  }
  return [...map.values()];
}

async function patchDungeonDrops(rel) {
  const p = path.join(root, rel);
  const { header, rows } = parseCsv(await readFile(p, "utf8"));
  const merged = mergeDropRows(rows, ["DungeonId", "MonsterId", "Category", "FromWave", "ToWave"]);
  const out = [header.join(",")];
  for (const r of merged) {
    out.push(header.map((h) => r[h] ?? "").join(","));
  }
  await writeFile(p, `${out.join("\n")}\n`, "utf8");
}

async function patchRaidDrops(rel) {
  const p = path.join(root, rel);
  const { header, rows } = parseCsv(await readFile(p, "utf8"));
  const merged = mergeDropRows(rows, ["RaidId", "Phase"]);
  const out = [header.join(",")];
  for (const r of merged) out.push(header.map((h) => r[h] ?? "").join(","));
  await writeFile(p, `${out.join("\n")}\n`, "utf8");
}

async function patchTowerDrops(rel) {
  const p = path.join(root, rel);
  const { header, rows } = parseCsv(await readFile(p, "utf8"));
  const merged = mergeDropRows(rows, []);
  const out = [header.join(",")];
  for (const r of merged) out.push(header.map((h) => r[h] ?? "").join(","));
  await writeFile(p, `${out.join("\n")}\n`, "utf8");
}

async function patchItemsJson() {
  const p = path.join(root, "data/items.json");
  const items = JSON.parse(await readFile(p, "utf8"));
  const filtered = items.filter((it) => !REMOVE_ITEM_IDS.has(it.id));
  for (const it of filtered) {
    if (it.id === "item_enhance_scroll_protect") {
      it.name = "강화 보호석";
    }
  }
  await writeFile(p, `${JSON.stringify(filtered, null, 2)}\n`, "utf8");
}

async function patchItemsCsv(rel) {
  const p = path.join(root, rel);
  const lines = (await readFile(p, "utf8")).trim().split(/\r?\n/);
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const id = lines[i].split(",")[0]?.trim();
    if (SCROLL_CSV_TO_MANA[id]) continue;
    if (id === "Item_Enhance_Scroll_Protect") {
      out.push(lines[i].replace("강화 보호 주문서", "강화 보호석"));
      continue;
    }
    out.push(lines[i]);
  }
  await writeFile(p, `${out.join("\n")}\n`, "utf8");
}

async function patchMerxatusCsv(rel) {
  const p = path.join(root, rel);
  const lines = (await readFile(p, "utf8")).trim().split(/\r?\n/);
  const out = lines.filter((line, i) => {
    if (i === 0) return true;
    const id = line.split(",")[0]?.trim();
    return !SCROLL_CSV_TO_MANA[id];
  });
  await writeFile(p, `${out.join("\n")}\n`, "utf8");
}

const SCROLL_TO_MANA_JSON = {
  item_enhance_scroll_low: "item_lesser_mana_stone",
  item_enhance_scroll_mid: "item_mana_stone",
  item_enhance_scroll_high: "item_greater_mana_stone",
};

function mergeLootDrops(drops) {
  const merged = new Map();
  for (const raw of drops) {
    const itemId = SCROLL_TO_MANA_JSON[raw.itemId] ?? raw.itemId;
    const bandKey = `${raw.minFloor ?? ""}:${raw.maxFloor ?? ""}`;
    const key = `${itemId}\0${bandKey}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { ...raw, itemId });
      continue;
    }
    prev.weight = (prev.weight ?? 0) + (raw.weight ?? 0);
    prev.minQty = Math.max(prev.minQty ?? 1, raw.minQty ?? 1);
    prev.maxQty = Math.max(prev.maxQty ?? 1, raw.maxQty ?? 1);
  }
  return [...merged.values()];
}

async function patchDungeonsJson() {
  const p = path.join(root, "data/dungeons.json");
  const dungeons = JSON.parse(await readFile(p, "utf8"));
  for (const d of dungeons) {
    for (const field of ["drops", "bossDrops"]) {
      if (Array.isArray(d[field])) d[field] = mergeLootDrops(d[field]);
    }
  }
  await writeFile(p, `${JSON.stringify(dungeons, null, 2)}\n`, "utf8");
}

await patchItemsJson();
await patchItemsCsv("data/csv-templates/items.csv");
await patchMerxatusCsv("data/Merxatus-Price.csv");
await patchMerxatusCsv("data/csv-templates/Merxatus-Price.csv");
await patchDungeonDrops("data/csv-templates/dungeon_drops.csv");
await patchRaidDrops("data/csv-templates/raid_drops.csv");
await patchTowerDrops("data/csv-templates/tower_drops.csv");
await patchDungeonsJson();

console.log("patch-remove-enhance-scrolls: ok — run apply-dungeon-drops + apply-raids-tower scripts next");
