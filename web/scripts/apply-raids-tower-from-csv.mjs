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

function parseNum(raw, def = 0) {
  const n = Number.parseFloat(String(raw ?? "").trim());
  return Number.isFinite(n) ? n : def;
}

async function readOptionalCsv(tplDir, file) {
  try {
    return parseCsv(await readFile(path.join(tplDir, file), "utf8"));
  } catch {
    return [];
  }
}

function normalizeRaidFaction(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "demon" || v === "abyss" || v === "악마" || v === "마계") return "demon";
  if (v === "angel" || v === "celestial" || v === "천사" || v === "천계") return "angel";
  return "void";
}

async function main() {
  const tplDir = path.join(process.cwd(), "data", "csv-templates");
  const dataDir = path.join(process.cwd(), "data");

  const raidRows = parseCsv(await readFile(path.join(tplDir, "raids.csv"), "utf8"));
  const encounterRows = parseCsv(await readFile(path.join(tplDir, "raid_encounters.csv"), "utf8"));
  const dropRows = parseCsv(await readFile(path.join(tplDir, "raid_drops.csv"), "utf8"));

  const raids = [];
  for (const r of raidRows) {
    const id = normalizeId(r.Id ?? r.id ?? r.RaidId ?? r.raidId);
    if (!id) continue;

    const encounters = encounterRows
      .filter((e) => normalizeId(e.RaidId ?? e.raidId) === id)
      .map((e) => ({
        monsterId: normalizeId(e.MonsterId ?? e.monsterId),
        category: String(e.Category ?? e.category ?? "Monster").trim(),
        phase: Math.max(1, Math.floor(parseNum(e.Phase ?? e.phase, 1))),
      }))
      .filter((e) => e.monsterId);

    const drops = [];
    const phaseDrops = [];
    for (const d of dropRows.filter((x) => normalizeId(x.RaidId ?? x.raidId) === id)) {
      const itemId = normalizeId(d.ItemId ?? d.itemId);
      if (!itemId.startsWith("item_")) continue;
      const entry = {
        itemId,
        weight: Math.max(0, Math.floor(parseNum(d.Weight ?? d.weight, 0))),
        minQty: Math.max(1, Math.floor(parseNum(d.MinQty ?? d.minQty ?? d.Min_Qty, 1))),
        maxQty: Math.max(
          1,
          Math.floor(parseNum(d.MaxQty ?? d.maxQty ?? d.Max_Qty, parseNum(d.MinQty ?? d.minQty ?? d.Min_Qty, 1))),
        ),
      };
      const kind = String(d.DropKind ?? d.dropKind ?? "CLEAR").trim().toUpperCase();
      if (kind === "PHASE") phaseDrops.push(entry);
      else drops.push(entry);
    }

    if (encounters.length === 0 || drops.length === 0) {
      throw new Error(`raid CSV incomplete for ${id}`);
    }

    raids.push({
      id,
      name: r.Name ?? r.name ?? id,
      maxPhases: Math.max(1, Math.min(12, Math.floor(parseNum(r.MaxPhases ?? r.maxPhases, encounters.length)))),
      maxPartySize: Math.max(1, Math.min(10, Math.floor(parseNum(r.MaxPartySize ?? r.maxPartySize, 3)))),
      faction: normalizeRaidFaction(r.Faction ?? r.faction),
      encounters,
      drops,
      phaseDrops,
    });
  }

  if (raids.length === 0) throw new Error("No raids produced from CSV");
  await writeFile(path.join(dataDir, "raids.json"), JSON.stringify(raids, null, 2) + "\n", "utf8");
  console.log(`OK: raids.json (${raids.length} raid(s))`);

  const towerRows = parseCsv(await readFile(path.join(tplDir, "tower.csv"), "utf8"));
  const towerDropRows = parseCsv(await readFile(path.join(tplDir, "tower_drops.csv"), "utf8"));
  const towerEncounterRows = await readOptionalCsv(tplDir, "tower_encounters.csv");
  const towerRow = towerRows[0];
  if (!towerRow) throw new Error("tower.csv: empty");

  const drops = towerDropRows
    .map((d) => {
      const itemId = normalizeId(d.ItemId ?? d.itemId);
      if (!itemId.startsWith("item_")) return null;
      return {
        itemId,
        weight: Math.max(0, Math.floor(parseNum(d.Weight ?? d.weight, 0))),
        minQty: Math.max(1, Math.floor(parseNum(d.MinQty ?? d.minQty ?? d.Min_Qty, 1))),
        maxQty: Math.max(
          1,
          Math.floor(parseNum(d.MaxQty ?? d.maxQty ?? d.Max_Qty, parseNum(d.MinQty ?? d.minQty ?? d.Min_Qty, 1))),
        ),
      };
    })
    .filter(Boolean);

  if (drops.length === 0) throw new Error("tower_drops.csv: no valid drops");

  const encounters = towerEncounterRows
    .map((r) => ({
      monsterId: normalizeId(r.MonsterId ?? r.monsterId),
      category: String(r.Category ?? r.category ?? "Monster").trim(),
      fromFloor: Math.max(1, Math.floor(parseNum(r.FromFloor ?? r.fromFloor ?? r.FromWave, 1))),
      toFloor: Math.max(
        1,
        Math.floor(parseNum(r.ToFloor ?? r.toFloor ?? r.ToWave, parseNum(r.FromFloor ?? r.fromFloor, 1))),
      ),
    }))
    .filter((e) => e.monsterId);

  const tower = {
    seasonKey: String(towerRow.SeasonKey ?? towerRow.seasonKey ?? "default").trim() || "default",
    name: towerRow.Name ?? towerRow.name ?? "삼계의 탑",
    encounterCycleFloors: Math.max(
      1,
      Math.floor(parseNum(towerRow.EncounterCycleFloors ?? towerRow.encounterCycleFloors, encounters.length ? 80 : 10)),
    ),
    encounters,
    baseMonsterId: encounters[0]?.monsterId ?? "slime",
    bossEveryFloors: 10,
    bossMonsterId: encounters.find((e) => String(e.category).toUpperCase() === "BOSS")?.monsterId ?? "slime_king",
    drops,
    leaderboardBoardKey: String(towerRow.LeaderboardBoardKey ?? towerRow.leaderboardBoardKey ?? "tower").trim() || "tower",
  };

  await writeFile(path.join(dataDir, "tower.json"), JSON.stringify(tower, null, 2) + "\n", "utf8");
  console.log(`OK: tower.json (${drops.length} drop(s), ${encounters.length} encounter band(s))`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
