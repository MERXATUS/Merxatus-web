/**
 * weapon_enhance_levels 성공률 곡선 적용
 * node scripts/patch-weapon-enhance-rates.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function rateForTargetLevel(lv) {
  if (lv <= 5) return 100;
  if (lv <= 10) return 100 - (lv - 5) * 5; // 95..75
  if (lv <= 15) return 70 - (lv - 11) * 5; // 70..50
  if (lv <= 20) return 48 - (lv - 16) * 3; // 48..33
  if (lv <= 25) return 30 - (lv - 21) * 2; // 30..20
  return Math.max(5, 18 - (lv - 26) * 2); // 18..8
}

const root = process.cwd();
const jsonPath = path.join(root, "data", "weapon_enhance_levels.json");
const csvPath = path.join(root, "data", "csv-templates", "weapon_enhance_levels.csv");

const rows = JSON.parse(await readFile(jsonPath, "utf8"));
for (const row of rows) {
  row.successRate = rateForTargetLevel(row.targetLevel);
}
await writeFile(jsonPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");

const header = "Target_LV,Gold_Cost,Scroll_Item_Id,Scroll_Qty,SuccessRate\n";
const csvLines = rows.map((r) => {
  const scroll =
    r.scrollItemId == null || r.scrollItemId === ""
      ? "None"
      : r.scrollItemId
          .replace(/^item_/, "Item_")
          .split("_")
          .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
          .join("_")
          .replace(/^Item_/, "Item_")
          .replace(/item_enhance/i, "Item_Enhance")
          .replace(/_low$/i, "_Low")
          .replace(/_mid$/i, "_Mid")
          .replace(/_high$/i, "_High");
  const scrollId =
    r.scrollItemId == null
      ? "None"
      : r.scrollItemId === "item_lesser_mana_stone"
        ? "Item_Lesser_Mana_Stone"
        : r.scrollItemId === "item_mana_stone"
          ? "Item_Mana_Stone"
          : r.scrollItemId === "item_greater_mana_stone"
            ? "Item_Greater_Mana_Stone"
            : r.scrollItemId;
  return `${r.targetLevel},${r.gold},${scrollId},${r.scrollQty ?? 0},${r.successRate}`;
});
await writeFile(csvPath, header + csvLines.join("\n") + "\n", "utf8");
console.log("OK: weapon enhance success rates patched");
