/**
 * 고용권 CSV 롤 + (선택) HTTP hatch API 스모크 테스트
 *
 *   node scripts/test-minion-recruit.mjs
 *   node scripts/test-minion-recruit.mjs --api --userId cmou789if0000uc1cxn4w9dsf
 */
import { spawn } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const useApi = args.includes("--api");
const userIdIdx = args.indexOf("--userId");
const userId = userIdIdx >= 0 ? args[userIdIdx + 1] : null;

const tickets = ["item_minion_ticket"];

function runRollTest() {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", path.join("scripts", "test-minion-recruit-roll.ts")], {
      cwd: process.cwd(),
      shell: true,
      stdio: "inherit",
    });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

console.log("=== CSV 롤 시뮬 ===\n");
await runRollTest();

if (useApi && userId) {
  console.log("\n=== HTTP POST /api/minions/hatch ===\n");
  for (const itemId of tickets) {
    try {
      const res = await fetch("http://localhost:3000/api/minions/hatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, itemId }),
      });
      const json = await res.json().catch(() => ({}));
      console.log(itemId, res.status, JSON.stringify(json, null, 0));
    } catch (e) {
      console.log(itemId, "FETCH_FAIL", e.message);
    }
  }
} else if (useApi) {
  console.log("\n--api 사용 시 --userId <dev_userId> 필요");
} else {
  console.log("\nAPI 테스트: node scripts/test-minion-recruit.mjs --api --userId <userId>");
}
