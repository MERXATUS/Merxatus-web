import { readFile, writeFile } from "node:fs/promises";

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        cur += "\"";
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

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = (cols[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function normalizeId(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .toLowerCase();
}

const csvPath = process.argv[2];
const itemsPath = process.argv[3];
if (!csvPath || !itemsPath) {
  throw new Error("Usage: node scripts/merge-item-icons-from-csv.mjs <items.csv> <items.json>");
}

const csvRows = parseCsv(await readFile(csvPath, "utf8"));
const iconById = new Map();
for (const r of csvRows) {
  const id = normalizeId(r.Id ?? r.id);
  const icon = String(r.Icon ?? r.icon ?? "")
    .trim()
    .replace(/\.png$/i, "");
  if (id && icon) iconById.set(id, icon);
}

const items = JSON.parse(await readFile(itemsPath, "utf8"));
const merged = items.map((it) => {
  const icon = iconById.get(it.id);
  return icon ? { ...it, icon } : it;
});

await writeFile(itemsPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
console.log(`OK: merged icons for ${merged.filter((it) => it.icon).length} items`);
