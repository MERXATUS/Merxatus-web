import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseCsv(text) {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
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

function isLootItemId(itemId) {
  return (
    itemId.startsWith("item_") ||
    itemId.startsWith("weapon_") ||
    itemId.startsWith("armor_")
  );
}

function parseNum(raw, def = 0) {
  const n = Number.parseFloat(String(raw ?? "").trim());
  return Number.isFinite(n) ? n : def;
}

function normalizeMode(raw) {
  const m = String(raw ?? "PUSH_LUCK").trim().toUpperCase();
  if (m === "AUTO_WAVES") return "AUTO_WAVES";
  return "PUSH_LUCK";
}

function encounterKey(dungeonId, monsterId, fromFloor, toFloor, category) {
  return `${dungeonId}|${monsterId}|${fromFloor}|${toFloor}|${category}`;
}

async function main() {
  const tplDir = path.join(process.cwd(), "data", "csv-templates");
  const dataDir = path.join(process.cwd(), "data");
  const dungeonsCsvPath = path.join(tplDir, "dungeons.csv");
  const dropsCsvPath = path.join(tplDir, "dungeon_drops.csv");
  const gearDropsCsvPath = path.join(tplDir, "dungeon_gear_drops.csv");
  const outPath = path.join(dataDir, "dungeons.json");

  const dungeonRows = parseCsv(await readFile(dungeonsCsvPath, "utf8"));
  const dropRows = parseCsv(await readFile(dropsCsvPath, "utf8"));
  let gearDropRows = [];
  try {
    gearDropRows = parseCsv(await readFile(gearDropsCsvPath, "utf8"));
  } catch {
    gearDropRows = [];
  }

  const dungeonsById = new Map();
  for (const r of dungeonRows) {
    const id = normalizeId(r.Id ?? r.id ?? r.DungeonId ?? r.dungeonId);
    if (!id) continue;
    dungeonsById.set(id, {
      id,
      name: r.Name ?? r.name ?? id,
      mode: normalizeMode(r.Mode ?? r.mode),
      baseWaveSeconds: Math.max(1, Math.floor(parseNum(r.BaseWaveSeconds ?? r.baseWaveSeconds, 8))),
      maxFloors: Math.max(1, Math.floor(parseNum(r.MaxFloors ?? r.maxFloors, 20))),
      maxPartySize: Math.max(1, Math.floor(parseNum(r.MaxParty ?? r.maxParty ?? r.MaxPartySize ?? r.maxPartySize, 1))),
      encounters: [],
      drops: [],
      bossDrops: [],
    });
  }

  const encounterSeen = new Set();

  for (const r of dropRows) {
    const dungeonId = normalizeId(r.DungeonId ?? r.dungeonId ?? "");
    const monsterId = normalizeId(r.MonsterId ?? r.monsterId ?? "");
    const itemId = normalizeId(r.ItemId ?? r.itemId ?? "");
    const fromFloor = Math.max(1, Math.floor(Number.parseInt(r.FromWave ?? r.fromWave ?? "1", 10) || 1));
    const toFloor = Math.max(
      fromFloor,
      Math.floor(Number.parseInt(r.ToWave ?? r.toWave ?? String(fromFloor), 10) || fromFloor),
    );
    const category = String(r.Category ?? r.category ?? "Monster").trim();
    const weight = Math.max(0, Math.floor(Number.parseInt(r.Weight ?? r.weight ?? "0", 10) || 0));
    const minQty = Math.max(1, Math.floor(Number.parseInt(r.MinQty ?? r.minQty ?? "1", 10) || 1));
    const maxQty = Math.max(minQty, Math.floor(Number.parseInt(r.MaxQty ?? r.maxQty ?? String(minQty), 10) || minQty));

    if (!dungeonId) continue;

    let dungeon = dungeonsById.get(dungeonId);
    if (!dungeon) {
      dungeon = {
        id: dungeonId,
        name: dungeonId,
        mode: "PUSH_LUCK",
        baseWaveSeconds: 8,
        maxFloors: toFloor,
        maxPartySize: 1,
        encounters: [],
        drops: [],
        bossDrops: [],
      };
      dungeonsById.set(dungeonId, dungeon);
    }

    if (monsterId) {
      const ek = encounterKey(dungeonId, monsterId, fromFloor, toFloor, category.toUpperCase());
      if (!encounterSeen.has(ek)) {
        encounterSeen.add(ek);
        dungeon.encounters.push({
          monsterId,
          category,
          fromFloor,
          toFloor,
        });
      }
    }

    if (!isLootItemId(itemId) || weight <= 0) continue;

    const entry = { itemId, weight, minQty, maxQty };
    if (category.toUpperCase() === "BOSS") dungeon.bossDrops.push(entry);
    else dungeon.drops.push(entry);
  }

  for (const r of gearDropRows) {
    const rawDungeon = String(r.DungeonId ?? r.dungeonId ?? "").trim();
    if (!rawDungeon || rawDungeon.startsWith("#")) continue;
    const dungeonId = normalizeId(r.DungeonId ?? r.dungeonId ?? "");
    const itemId = normalizeId(r.ItemId ?? r.itemId ?? "");
    const minFloor = Math.max(1, Math.floor(Number.parseInt(r.MinFloor ?? r.minFloor ?? "1", 10) || 1));
    const maxFloor = Math.max(
      minFloor,
      Math.floor(Number.parseInt(r.MaxFloor ?? r.maxFloor ?? String(minFloor), 10) || minFloor),
    );
    const pool = String(r.Pool ?? r.pool ?? "normal").trim().toLowerCase();
    const weight = Math.max(0, Math.floor(Number.parseInt(r.Weight ?? r.weight ?? "0", 10) || 0));
    const minQty = Math.max(1, Math.floor(Number.parseInt(r.MinQty ?? r.minQty ?? "1", 10) || 1));
    const maxQty = Math.max(minQty, Math.floor(Number.parseInt(r.MaxQty ?? r.maxQty ?? String(minQty), 10) || minQty));
    if (!dungeonId || !isLootItemId(itemId) || weight <= 0) continue;

    const dungeon = dungeonsById.get(dungeonId);
    if (!dungeon) continue;

    const entry = { itemId, weight, minQty, maxQty, minFloor, maxFloor };
    if (pool === "boss") dungeon.bossDrops.push(entry);
    else dungeon.drops.push(entry);
  }

  const dungeons = [...dungeonsById.values()].filter(
    (d) => d.encounters.length > 0 && (d.drops.length > 0 || d.bossDrops.length > 0),
  );
  if (dungeons.length === 0) throw new Error("No dungeons produced from CSV");

  for (const d of dungeons) {
    d.encounters.sort((a, b) => a.fromFloor - b.fromFloor || a.toFloor - b.toFloor);
    if (d.drops.length === 0) {
      d.drops = [...d.bossDrops];
      d.bossDrops = [];
    }
  }

  await writeFile(outPath, JSON.stringify(dungeons, null, 2) + "\n", "utf8");
  console.log(`OK: dungeons.json (${dungeons.length} dungeon(s), monster encounters from CSV)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
