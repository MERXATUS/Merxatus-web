import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type MinionCsvKind = "GATHER" | "DUNGEON";

export type MinionRecruitTicketDef = {
  itemId: string;
  nameKo: string;
  /** 고용 시 후보 수 */
  pickCount: number;
};

export type MinionCsvBundle = {
  ticketsByItemId: Map<string, MinionRecruitTicketDef>;
};

let cached: MinionCsvBundle | null = null;

export const UNIFIED_MINION_RECRUIT_ITEM_ID = "item_minion_ticket";
const DEFAULT_PICK_COUNT = 3;

function splitCsvLine(line: string) {
  const out: string[] = [];
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

function parseCsv(text: string): Array<Record<string, string>> {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length <= 1) return [];
  const header = splitCsvLine(lines[0]!).map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) row[header[j]!] = (cols[j] ?? "").trim();
    rows.push(row);
  }
  return rows;
}

export function normalizeMinionItemId(raw: string) {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .toLowerCase();
}

function resolveCsvDir() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "data", "csv-templates"),
    path.join(cwd, "web", "data", "csv-templates"),
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "minion_tickets.csv"))) {
      return dir;
    }
  }
  return candidates[0]!;
}

function rowField(row: Record<string, string>, ...keys: string[]) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k]!;
  }
  return "";
}

export async function loadMinionCsvBundle(): Promise<MinionCsvBundle> {
  if (cached) return cached;

  const dir = resolveCsvDir();
  const ticketsText = await readFile(path.join(dir, "minion_tickets.csv"), "utf8").catch(() => "");

  const ticketsByItemId = new Map<string, MinionRecruitTicketDef>();
  for (const row of parseCsv(ticketsText)) {
    const itemId = normalizeMinionItemId(rowField(row, "ItemID", "ItemId", "itemId"));
    if (!itemId) continue;
    const pickRaw = rowField(row, "Pick", "pick", "PickCount", "pickCount");
    const pickCount = Math.max(1, Math.floor(Number.parseInt(pickRaw || String(DEFAULT_PICK_COUNT), 10) || DEFAULT_PICK_COUNT));
    ticketsByItemId.set(itemId, {
      itemId,
      nameKo: rowField(row, "NameKo", "Name", "name") || itemId,
      pickCount,
    });
  }

  cached = { ticketsByItemId };
  return cached;
}

export function clearMinionCsvCache() {
  cached = null;
}
