/**
 * 미니언 CSV 검증 (minion_tickets.csv · minion_jobs.csv)
 *
 *   node scripts/validate-minion-csv.mjs
 *   node scripts/validate-minion-csv.mjs --dir web/data/csv-templates
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const MINION_KINDS = ["GATHER", "DUNGEON"];

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

function parseCsv(text) {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length <= 0) return { header: [], rows: [] };
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
  return { header, rows };
}

function err(messages, msg) {
  messages.push(`ERROR: ${msg}`);
}

function warn(messages, msg) {
  messages.push(`WARN: ${msg}`);
}

function normalizeItemId(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .toLowerCase();
}

async function loadCsv(dir, name) {
  const p = path.join(dir, name);
  if (!existsSync(p)) throw new Error(`파일 없음: ${p}`);
  const text = await readFile(p, "utf8");
  return parseCsv(text);
}

async function main() {
  const dirArg = process.argv.indexOf("--dir");
  const dir =
    dirArg >= 0 && process.argv[dirArg + 1]
      ? path.resolve(process.argv[dirArg + 1])
      : path.join(process.cwd(), "data", "csv-templates");

  const messages = [];
  let failed = false;

  const ticketsPath = path.join(dir, "minion_tickets.csv");
  if (!existsSync(ticketsPath)) {
    err(messages, "minion_tickets.csv 없음");
  }

  const jobsPath = path.join(dir, "minion_jobs.csv");
  if (!existsSync(jobsPath)) {
    err(messages, "minion_jobs.csv 없음");
  }

  if (messages.some((m) => m.startsWith("ERROR:"))) {
    for (const m of messages) console.log(m);
    process.exit(1);
  }

  const [tickets, jobs] = await Promise.all([
    loadCsv(dir, "minion_tickets.csv"),
    loadCsv(dir, "minion_jobs.csv"),
  ]);

  const ticketById = new Map();
  for (const row of tickets.rows) {
    const id = normalizeItemId(row.ItemID ?? row.ItemId ?? row.itemId);
    if (!id) {
      err(messages, "minion_tickets.csv: ItemId 비어 있음");
      continue;
    }
    if (ticketById.has(id)) err(messages, `minion_tickets.csv: ItemId 중복 ${id}`);
    ticketById.set(id, row);

    const pick = Number.parseInt(row.Pick ?? row.pick ?? row.PickCount ?? row.pickCount ?? "3", 10);
    if (!Number.isFinite(pick) || pick < 1) {
      err(messages, `minion_tickets.csv: Pick 잘못됨 (${id})`);
    }
  }
  if (ticketById.size === 0) {
    err(messages, "minion_tickets.csv: 고용권 행 없음");
  }

  const jobsByCategory = new Map(MINION_KINDS.map((k) => [k, []]));
  const jobIds = new Set();
  for (const row of jobs.rows) {
    const jobId = String(row.JobId ?? row.jobId ?? "").trim().toUpperCase();
    const category = String(row.Category ?? row.category ?? "").trim().toUpperCase();
    if (!jobId) {
      err(messages, "minion_jobs.csv: JobId 비어 있음");
      continue;
    }
    if (!MINION_KINDS.includes(category)) {
      err(messages, `minion_jobs.csv: Category 잘못됨 (${jobId})`);
      continue;
    }
    if (jobIds.has(jobId)) err(messages, `minion_jobs.csv: JobId 중복 ${jobId}`);
    jobIds.add(jobId);

    const enabled = String(row.Enabled ?? row.enabled ?? "true").trim().toLowerCase() !== "false";
    if (enabled) jobsByCategory.get(category).push(jobId);
  }

  for (const kind of MINION_KINDS) {
    if (jobsByCategory.get(kind).length === 0) {
      err(messages, `minion_jobs.csv: ${kind} enabled 직업 없음`);
    }
  }

  for (const ticket of ticketById.values()) {
    const pick = Number.parseInt(ticket.Pick ?? ticket.pick ?? ticket.PickCount ?? ticket.pickCount ?? "3", 10);
    for (const kind of MINION_KINDS) {
      const pool = jobsByCategory.get(kind);
      if (pool.length > 0 && pick > pool.length) {
        warn(
          messages,
          `minion_tickets.csv: Pick=${pick} > ${kind} enabled 직업 수(${pool.length}) — 후보가 중복될 수 있음`,
        );
      }
    }
  }

  const itemsPath = path.join(dir, "items.csv");
  if (existsSync(itemsPath)) {
    const items = await loadCsv(dir, "items.csv");
    const itemIds = new Set(
      items.rows.map((r) => normalizeItemId(r.Id ?? r.id ?? r.ItemId ?? r.itemId)),
    );
    for (const ticketId of ticketById.keys()) {
      if (!itemIds.has(normalizeItemId(ticketId))) {
        warn(messages, `items.csv에 고용권 아이템 없음: ${ticketId}`);
      }
    }
  } else {
    warn(messages, "items.csv 없음 — 고용권 ItemId는 items.json에도 등록해야 함");
  }

  console.log(`\n검증 경로: ${dir}\n`);
  for (const m of messages) {
    console.log(m);
    if (m.startsWith("ERROR:")) failed = true;
  }
  if (messages.length === 0) console.log("OK: 문제 없음");
  else if (!failed) console.log("\nOK: ERROR 없음 (WARN만 있음)");
  else console.log("\n실패: ERROR를 수정한 뒤 다시 실행하세요.");

  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
