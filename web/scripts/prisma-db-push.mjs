/**
 * Supabase Transaction pooler(6543)에서는 db push가 멈출 수 있어
 * Session pooler(5432) URL로 push합니다.
 *
 *   cd web && node scripts/prisma-db-push.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(webRoot, ".env");

function parseLine(text, key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m) return null;
  let v = m[1].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

if (!existsSync(envPath)) {
  console.error("[db:push] .env 없음");
  process.exit(1);
}

const text = readFileSync(envPath, "utf8");
const direct = parseLine(text, "DIRECT_URL");
const runtime = parseLine(text, "DATABASE_URL");
const raw = direct || runtime;

if (!raw) {
  console.error("[db:push] DATABASE_URL 또는 DIRECT_URL 필요");
  process.exit(1);
}

let pushUrl = raw;
if (!direct && runtime?.includes("pooler.supabase.com") && runtime.includes(":6543")) {
  const u = new URL(runtime.replace(/^postgresql:/, "postgres:"));
  u.port = "5432";
  u.search = "";
  pushUrl = u.toString().replace(/^postgres:/, "postgresql:");
  console.log("[db:push] Transaction pooler(6543) → Session pooler(5432)로 push");
} else if (direct) {
  console.log("[db:push] DIRECT_URL 사용");
}

const prismaBin = path.join(webRoot, "node_modules", "prisma", "build", "index.js");
const child = spawnSync(process.execPath, [prismaBin, "db", "push"], {
  cwd: webRoot,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: pushUrl },
});

if (child.status === 0) {
  console.log("[db:push] 완료 — dev 서버를 재시작하세요.");
}

process.exit(child.status ?? 1);
