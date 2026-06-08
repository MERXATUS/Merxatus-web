/**
 * 티어별 크래프팅 드랍 가중치 미리보기 (shared/craftingItemDrops.ts 와 동기)
 * 실행: node scripts/print-crafting-drop-table.mjs
 */
import {
  craftingDropRowsForContext,
  craftingDropRowsForTower,
} from "../src/shared/craftingItemDrops.ts";

for (const tier of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const normal = craftingDropRowsForContext({ tier, maxFloors: 20 });
  const boss = craftingDropRowsForContext({ tier, maxFloors: 20, boss: true });
  const wSum = (rows) => rows.reduce((a, r) => a + r.weight, 0);
  console.log(`\n=== tier ${tier} (stage) ===`);
  console.log("floor:", normal.map((r) => `${r.itemId} w${r.weight}${r.minFloor ? ` f>=${r.minFloor}` : ""}`).join("\n  "));
  console.log("weight sum:", wSum(normal));
  console.log("boss:", boss.map((r) => `${r.itemId} w${r.weight}`).join(", "));
}

const towerRows = craftingDropRowsForTower();
console.log("\n=== tower bands ===", towerRows.length, "rows");
