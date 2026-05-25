import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Merxatus `Dungeon_Slime_Forest` → 시드 `dungeon_slime_forest_1` */
const DUNGEON_ID_ALIASES = {
  dungeon_slime_forest: "dungeon_slime_forest_1",
};

function parseCsv(text) {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length <= 0) return [];
  const rows = [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = (cols[j] ?? "").trim();
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function normalizeId(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .toLowerCase();
}

function resolveDungeonId(raw) {
  const id = normalizeId(raw);
  return DUNGEON_ID_ALIASES[id] ?? id;
}

async function main() {
  const idx = process.argv.indexOf("--csv");
  const csvPath = idx >= 0 ? process.argv[idx + 1] : null;
  if (!csvPath) throw new Error("Usage: node scripts/apply-dungeon-drops-from-csv.mjs --csv <dungeon_drops.csv>");

  const dataDir = path.join(process.cwd(), "data");
  const dungeonsPath = path.join(dataDir, "dungeons.json");
  const rows = parseCsv(await readFile(csvPath, "utf8"));
  const dungeons = JSON.parse(await readFile(dungeonsPath, "utf8"));

  const dropsByDungeon = new Map();
  for (const r of rows) {
    const dungeonId = resolveDungeonId(r.DungeonId ?? r.dungeonId ?? "");
    const itemId = normalizeId(r.ItemId ?? r.itemId ?? "");
    const weight = Math.max(0, Math.floor(Number.parseInt(r.Weight ?? r.weight ?? "0", 10) || 0));
    const minQty = Math.max(1, Math.floor(Number.parseInt(r.MinQty ?? r.minQty ?? "1", 10) || 1));
    const maxQty = Math.max(minQty, Math.floor(Number.parseInt(r.MaxQty ?? r.maxQty ?? String(minQty), 10) || minQty));
    if (!dungeonId || !itemId.startsWith("item_")) continue;
    const arr = dropsByDungeon.get(dungeonId) ?? [];
    arr.push({ itemId, weight, minQty, maxQty });
    dropsByDungeon.set(dungeonId, arr);
  }

  let updated = 0;
  for (const d of dungeons) {
    const next = dropsByDungeon.get(d.id);
    if (!next?.length) continue;
    d.drops = next;
    updated++;
  }

  await writeFile(dungeonsPath, JSON.stringify(dungeons, null, 2) + "\n", "utf8");
  console.log(`OK: dungeon drops updated for ${updated} dungeon(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
