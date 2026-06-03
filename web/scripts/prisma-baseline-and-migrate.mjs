/**
 * Supabase 등에서 db push 로 스키마만 맞춘 DB에 migrate deploy(P3005)를 쓰기 위한 1회 baseline.
 * 이미 있는 마이그레이션은 "적용됨"으로 표시하고, raid_tower_leaderboard 만 deploy.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(webRoot, ".env");
const RAID_MIGRATION = "20260531130100_raid_tower_leaderboard";

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

loadDotEnv(envPath);

if (!process.env.DIRECT_URL) {
  console.error("[db:baseline] DIRECT_URL이 .env에 필요합니다.");
  process.exit(1);
}

const prismaBin = path.join(webRoot, "node_modules", "prisma", "build", "index.js");
const migrateEnv = { ...process.env, DATABASE_URL: process.env.DIRECT_URL };

function runPrisma(args) {
  const r = spawnSync(process.execPath, [prismaBin, ...args], {
    cwd: webRoot,
    stdio: "inherit",
    env: migrateEnv,
  });
  return r.status ?? 1;
}

const migrationsDir = path.join(webRoot, "prisma", "migrations");
const names = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const beforeRaid = names.filter((n) => n < RAID_MIGRATION);
console.log(`[db:baseline] ${beforeRaid.length}개 마이그레이션을 이미 적용된 것으로 표시…`);

for (const name of beforeRaid) {
  const code = runPrisma(["migrate", "resolve", "--applied", name]);
  if (code !== 0) {
    console.warn(`[db:baseline] skip or already resolved: ${name}`);
  }
}

console.log("[db:baseline] raid/tower 마이그레이션 deploy…");
process.exit(runPrisma(["migrate", "deploy"]));
