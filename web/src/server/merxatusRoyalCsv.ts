import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Merxatus CSV의 ItemID → DB `Item.id` (예: Item_Stone → item_stone) */
export function normalizeMerxatusItemId(raw: string): string {
  return String(raw ?? "").trim().replace(/\s+/g, "_").replace(/-+/g, "_").toLowerCase();
}

/** 파일을 못 찾거나 파싱 결과가 비었을 때 쓰는 기본 표(레포 `Merxatus-Price.csv`와 동일). */
export const MERXATUS_ROYAL_PRICE_CSV_FALLBACK = [
  "ItemID,Buy_Price,Sell_Price",
  "Item_Stone,12,10",
  "Item_Dark_Iron_Ore,120,100",
  "Item_Red_Gold_Ore,1200,1000",
].join("\n");

function splitCsvLine(line: string): string[] {
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

export function parseCsvRows(text: string): Record<string, string>[] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\ufeff/g, "");
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length <= 0) return [];
  const rows: Record<string, string>[] = [];
  const header = splitCsvLine(lines[0]!).map((h) => h.trim().replace(/^\uFEFF/, "").replace(/\ufeff/g, ""));
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      const key = header[j]!;
      if (!key) continue;
      row[key] = (cols[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function col(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  for (const rk of Object.keys(row)) {
    const lk = rk.toLowerCase().replace(/\s+/g, "");
    for (const want of keys.map((x) => x.toLowerCase().replace(/\s+/g, ""))) {
      if (lk === want) return String(row[rk] ?? "").trim();
    }
  }
  return "";
}

export type MerxatusRoyalRow = { itemId: string; buyPricePerUnit: number; sellPricePerUnit: number };

export function parseMerxatusRoyalPriceCsv(text: string): MerxatusRoyalRow[] {
  const raw = parseCsvRows(text);
  const out: MerxatusRoyalRow[] = [];
  for (const row of raw) {
    const idRaw = col(row, "ItemID", "ItemId", "itemId", "item_id");
    const buyRaw = col(row, "Buy_Price", "BuyPrice", "buy_price", "buyPricePerUnit");
    const sellRaw = col(row, "Sell_Price", "SellPrice", "sell_price", "sellPricePerUnit");
    const itemId = normalizeMerxatusItemId(idRaw);
    if (!itemId) continue;
    const buyPricePerUnit = Math.max(1, Math.floor(Number.parseInt(buyRaw, 10) || 0));
    const sellPricePerUnit = Math.max(1, Math.floor(Number.parseInt(sellRaw, 10) || 0));
    if (buyPricePerUnit < sellPricePerUnit) {
      out.push({ itemId, buyPricePerUnit: sellPricePerUnit, sellPricePerUnit: buyPricePerUnit });
    } else {
      out.push({ itemId, buyPricePerUnit, sellPricePerUnit });
    }
  }
  return out;
}

export function resolveMerxatusPriceCsvPath(): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "data", "Merxatus-Price.csv"),
    path.join(cwd, "web", "data", "Merxatus-Price.csv"),
    path.join(cwd, "web", "data", "csv-templates", "Merxatus-Price.csv"),
    path.join(cwd, "..", "data", "Merxatus-Price.csv"),
    path.join(cwd, "..", "web", "data", "Merxatus-Price.csv"),
    path.join(cwd, "..", "..", "web", "data", "Merxatus-Price.csv"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export async function loadMerxatusRoyalPriceRows(): Promise<MerxatusRoyalRow[]> {
  const p = resolveMerxatusPriceCsvPath();
  let text = "";
  if (p) {
    try {
      text = await readFile(p, "utf8");
    } catch {
      text = "";
    }
  }
  let rows = parseMerxatusRoyalPriceCsv(text);
  if (rows.length === 0) {
    rows = parseMerxatusRoyalPriceCsv(MERXATUS_ROYAL_PRICE_CSV_FALLBACK);
    if (rows.length > 0) {
      console.warn(
        "[merxatusRoyalCsv] Merxatus-Price.csv 를 읽지 못했거나 비어 있어 기본 가격표를 사용합니다. (경로·BOM·컬럼명 확인)",
      );
    }
  }
  return rows;
}
