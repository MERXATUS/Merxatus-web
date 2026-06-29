/**
 * UI 번들용 드랍표 JSON — 없으면 생성
 */
import { existsSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const REQUIRED_FILES = [
  "dungeon_drop_tables.json",
  "raid_drop_tables.json",
  "tower_drop_table.json",
];

function needsGenerate(filename) {
  const outPath = path.join(webRoot, "data", filename);
  if (!existsSync(outPath)) return true;
  try {
    return statSync(outPath).size < 16;
  } catch {
    return true;
  }
}

function runGen() {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", "scripts/gen-drop-tables.ts"], {
      cwd: webRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`gen-drop-tables exit ${code}`)),
    );
  });
}

async function main() {
  if (!REQUIRED_FILES.some(needsGenerate)) return;
  console.log("[ensure] generating drop table JSON files …");
  await runGen();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
