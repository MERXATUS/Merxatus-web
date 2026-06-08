/**
 * A+B 옵션 밸런스 + 강화 주문서→마석 데이터 패치
 * node scripts/patch-option-mana-balance.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

function bumpTiers(obj, maxIdx = 3, mult = 1.3) {
  for (const row of Object.values(obj)) {
    if (!row.tiers) continue;
    for (let i = 0; i <= maxIdx && i < row.tiers.length; i++) {
      const v = row.tiers[i];
      row.tiers[i] =
        v < 10 && !Number.isInteger(v) ? Math.round(v * mult * 10) / 10 : Math.round(v * mult);
    }
  }
  return obj;
}

async function bumpJson(rel) {
  const p = path.join(root, rel);
  const data = JSON.parse(await readFile(p, "utf8"));
  bumpTiers(data);
  await writeFile(p, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function bumpCsv(rel) {
  const p = path.join(root, rel);
  const lines = (await readFile(p, "utf8")).trim().split(/\r?\n/);
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    for (let c = 2; c <= 5; c++) {
      const v = parseFloat(parts[c]);
      if (!Number.isFinite(v)) continue;
      parts[c] = String(
        v < 10 && !Number.isInteger(v) ? Math.round(v * 1.3 * 10) / 10 : Math.round(v * 1.3),
      );
    }
    out.push(parts.join(","));
  }
  await writeFile(p, `${out.join("\n")}\n`, "utf8");
}

const SCROLL_TO_MANA = {
  item_enhance_scroll_low: "item_lesser_mana_stone",
  item_enhance_scroll_mid: "item_mana_stone",
  item_enhance_scroll_high: "item_greater_mana_stone",
};

async function replaceScrollsInJson(rel) {
  const p = path.join(root, rel);
  let s = await readFile(p, "utf8");
  for (const [from, to] of Object.entries(SCROLL_TO_MANA)) {
    s = s.replaceAll(`"${from}"`, `"${to}"`);
  }
  await writeFile(p, s, "utf8");
}

const MANA_CSV_ID = {
  item_lesser_mana_stone: "Item_Lesser_Mana_Stone",
  item_mana_stone: "Item_Mana_Stone",
  item_greater_mana_stone: "Item_Greater_Mana_Stone",
};

await bumpJson("data/weapon_option_tiers.json");
await bumpJson("data/armor_option_tiers.json");
await bumpCsv("data/csv-templates/weapon_option.csv");
await bumpCsv("data/csv-templates/armor_option.csv");

for (const rel of ["data/dungeons.json", "data/raids.json", "data/tower.json"]) {
  await replaceScrollsInJson(rel);
}

const levelsPath = path.join(root, "data/weapon_enhance_levels.json");
const levels = JSON.parse(await readFile(levelsPath, "utf8"));
for (const row of levels) {
  if (row.scrollItemId && SCROLL_TO_MANA[row.scrollItemId]) {
    row.scrollItemId = SCROLL_TO_MANA[row.scrollItemId];
  }
}
await writeFile(levelsPath, `${JSON.stringify(levels, null, 2)}\n`, "utf8");

const csvLines = ["Target_LV,Gold_Cost,Scroll_Item_Id,Scroll_Qty,SuccessRate"];
for (const r of levels) {
  const id = MANA_CSV_ID[r.scrollItemId] ?? "None";
  csvLines.push([r.targetLevel, r.gold, id, r.scrollQty, r.successRate].join(","));
}
await writeFile(path.join(root, "data/csv-templates/weapon_enhance_levels.csv"), `${csvLines.join("\n")}\n`, "utf8");

console.log("patch-option-mana-balance: ok");
