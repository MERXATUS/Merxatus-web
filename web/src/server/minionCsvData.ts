import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MinionJobType } from "@prisma/client";

export type MinionCsvKind = "GATHER" | "DUNGEON";

export type MinionRecruitTicketDef = {
  itemId: string;
  nameKo: string;
  /** 고용 시 후보 직업 수 (minion_jobs.csv에서 무작위) */
  pickCount: number;
};

export type MinionJobDef = {
  jobId: MinionJobType;
  labelKo: string;
  category: MinionCsvKind;
  enabled: boolean;
  workshopName?: string;
};

export type MinionCsvBundle = {
  ticketsByItemId: Map<string, MinionRecruitTicketDef>;
  jobsByCategory: Map<MinionCsvKind, MinionJobDef[]>;
};

let cached: MinionCsvBundle | null = null;

export const UNIFIED_MINION_RECRUIT_ITEM_ID = "item_minion_ticket";
const DEFAULT_PICK_COUNT = 3;

const JOB_ALIASES: Record<string, MinionJobType> = {
  MINER: "MINER",
  FISHER: "FISHER",
  ARCHAEOLOGIST: "ARCHAEOLOGIST",
  EXPLORER: "EXPLORER",
  LUMBERJACK: "LUMBERJACK",
  HERBALIST: "HERBALIST",
  WARRIOR: "WARRIOR",
  ARCHER: "ARCHER",
  MAGE: "MAGE",
};

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

function normalizeMinionKind(raw: string): MinionCsvKind | null {
  const k = String(raw ?? "").trim().toUpperCase();
  if (k === "GATHER") return "GATHER";
  if (k === "DUNGEON") return "DUNGEON";
  return null;
}

function parseBool(raw: string) {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "y" || v === "yes";
}

function resolveCsvDir() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "data", "csv-templates"),
    path.join(cwd, "web", "data", "csv-templates"),
  ];
  for (const dir of candidates) {
    if (
      existsSync(path.join(dir, "minion_tickets.csv")) ||
      existsSync(path.join(dir, "minion_jobs.csv"))
    ) {
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

async function loadJobs(dir: string): Promise<Map<MinionCsvKind, MinionJobDef[]>> {
  const jobsPath = path.join(dir, "minion_jobs.csv");
  const byCategory = new Map<MinionCsvKind, MinionJobDef[]>([
    ["GATHER", []],
    ["DUNGEON", []],
  ]);
  if (!existsSync(jobsPath)) return byCategory;

  for (const row of parseCsv(await readFile(jobsPath, "utf8"))) {
    const jobKey = rowField(row, "JobId", "jobId").toUpperCase();
    const jobId = JOB_ALIASES[jobKey];
    const category = normalizeMinionKind(rowField(row, "Category", "category"));
    if (!jobId || !category) continue;
    byCategory.get(category)!.push({
      jobId,
      labelKo: rowField(row, "LabelKo", "labelKo", "Name", "name") || jobId,
      category,
      enabled: parseBool(rowField(row, "Enabled", "enabled", "true")),
      workshopName: rowField(row, "WorkshopName", "workshopName") || undefined,
    });
  }
  return byCategory;
}

export async function loadMinionCsvBundle(): Promise<MinionCsvBundle> {
  if (cached) return cached;

  const dir = resolveCsvDir();
  const [ticketsText, jobsByCategory] = await Promise.all([
    readFile(path.join(dir, "minion_tickets.csv"), "utf8").catch(() => ""),
    loadJobs(dir),
  ]);

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

  cached = { ticketsByItemId, jobsByCategory };
  return cached;
}

export function clearMinionCsvCache() {
  cached = null;
}

export function enabledJobsForCategory(bundle: MinionCsvBundle, category: MinionCsvKind): MinionJobDef[] {
  return (bundle.jobsByCategory.get(category) ?? []).filter((j) => j.enabled);
}
