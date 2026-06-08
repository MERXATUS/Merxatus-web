#!/usr/bin/env node
/**
 * dungeon_gear_drops.csv — 5단계 장비(사슬·다이아) 드랍표 갱신
 */
import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "data/csv-templates/dungeon_gear_drops.csv");
let text = fs.readFileSync(file, "utf8");
const lines = text.split(/\r?\n/);
const header = lines[0];
const rows = lines.slice(1).filter((l) => l.trim() && !l.startsWith("#"));

const CHAIN = [
  "armor_chain_helmet",
  "armor_chain_armor",
  "armor_chain_pants",
  "armor_chain_boots",
];
const DIAMOND = [
  "weapon_diamond_sword",
  "armor_diamond_helmet",
  "armor_diamond_armor",
  "armor_diamond_pants",
  "armor_diamond_boots",
];

function row(dungeon, itemId, minF, maxF, weight, pool) {
  return `${dungeon},${itemId},${minF},${maxF},${weight},1,1,${pool}`;
}

const out = [header];
const kept = [];

for (const line of rows) {
  const [dungeon, itemId, minF, maxF, weight, , , pool] = line.split(",");
  if (!dungeon || !itemId) continue;

  // 슬라임: 철검 프리뷰 제거
  if (dungeon === "dungeon_slime_forest" && itemId === "weapon_steel_sword") continue;

  // 고블린: 메인 풀에서 맹세검 제거 (늑대부터)
  if (dungeon === "dungeon_goblin_den" && itemId === "weapon_steel_sword" && Number(minF) <= 13) continue;

  // 화염·얼음: 금 세트 → 성좌(다이아)
  if (
    (dungeon === "dungeon_scorch_rift" || dungeon === "dungeon_frost_citadel") &&
    (itemId.startsWith("armor_golden_") || itemId === "weapon_gold_sword")
  ) {
    const map = {
      weapon_gold_sword: "weapon_diamond_sword",
      armor_golden_helmet: "armor_diamond_helmet",
      armor_golden_armor: "armor_diamond_armor",
      armor_golden_pants: "armor_diamond_pants",
      armor_golden_boots: "armor_diamond_boots",
    };
    kept.push(row(dungeon, map[itemId], minF, maxF, weight, pool));
    continue;
  }

  kept.push(line);
}

// 슬라임: 사슬 세트 추가 (가죽과 동일 가중)
for (const line of [...kept]) {
  const [dungeon, itemId, minF, maxF, weight, , , pool] = line.split(",");
  if (dungeon !== "dungeon_slime_forest") continue;
  if (!itemId.startsWith("armor_leather_")) continue;
  const slot = itemId.replace("armor_leather_", "");
  const chainId = `armor_chain_${slot}`;
  if (CHAIN.includes(chainId)) {
    kept.push(row(dungeon, chainId, minF, maxF, weight, pool));
  }
}

out.push(...kept);
fs.writeFileSync(file, `${out.join("\n")}\n`, "utf8");
console.log(`Updated ${file} (${kept.length} rows)`);
