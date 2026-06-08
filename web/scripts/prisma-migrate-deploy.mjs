/**
 * Supabase: migrate deploy는 Transaction pooler(6543)에서 멈추거나 prepared statement 오류가 납니다.
 * DIRECT_URL(직접 연결, 보통 :5432)을 .env에 넣은 뒤 실행하세요.
 *
 *   cd web && npm run db:migrate
 *
 * DIRECT_URL 없이 Supabase 대시보드 → SQL Editor에서
 * prisma/migrations/20260531130100_raid_tower_leaderboard/migration.sql 을 붙여넣어 실행해도 됩니다.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(webRoot, ".env");

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

if (!process.env.DATABASE_URL) {
  console.error("[db:migrate] DATABASE_URL이 .env에 없습니다.");
  process.exit(1);
}

if (!process.env.DIRECT_URL) {
  console.error(`
[db:migrate] DIRECT_URL이 필요합니다.

Supabase → Project Settings → Database → Connection string → URI (Direct)
를 복사해 web/.env 에 추가하세요:

  DIRECT_URL="postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres"

Windows에서 Direct(db.*:5432)가 P1001 이면 **Session pooler** 를 쓰세요 (DATABASE_URL 호스트 + :5432, 사용자 postgres.[ref]):

  DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"

(pooler 6543 URL을 migrate 에 쓰면 실패합니다.)

또는 Supabase SQL Editor에서 미적용 migration.sql 을 실행하세요. 예:
  prisma/migrations/20260603140000_armor_enhance_level/migration.sql

적용 후 반드시 (dev 서버를 끈 뒤):
  npx prisma generate
`);
  process.exit(1);
}

const prismaBin = path.join(webRoot, "node_modules", "prisma", "build", "index.js");
const migrateEnv = {
  ...process.env,
  // migrate deploy는 Direct(5432)로만 안정 동작 — pooler URL은 덮어씀
  DATABASE_URL: process.env.DIRECT_URL,
};
const child = spawnSync(process.execPath, [prismaBin, "migrate", "deploy"], {
  cwd: webRoot,
  stdio: "inherit",
  env: migrateEnv,
});

process.exit(child.status ?? 1);
