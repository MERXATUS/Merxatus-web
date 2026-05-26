/**
 * DATABASE_URL로 DB 연결 테스트 (비밀번호 출력 안 함)
 *   node scripts/test-database-connection.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

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

const envPath = path.join(process.cwd(), ".env");
const text = fs.readFileSync(envPath, "utf8");
const url = parseLine(text, "DATABASE_URL");
if (!url) {
  console.error("DATABASE_URL 없음");
  process.exit(1);
}

process.env.DATABASE_URL = url;

async function main() {
  const prisma = new PrismaClient({ log: [] });
  try {
    const n = await prisma.user.count();
    console.log("✓ DB 연결 성공. User 행 수:", n);
  } catch (e) {
    console.error("✗ DB 연결 실패:");
    console.error(e.message?.split("\n").slice(0, 5).join("\n") ?? e);
    console.error("\n힌트:");
    console.error("1. Supabase → Database → Reset database password");
    console.error("2. Connect → Transaction pooler → URI 복사 (비밀번호 칸에 새 비밀번호 입력)");
    console.error("3. 끝에 ?pgbouncer=true&connection_limit=1 추가");
    console.error("4. Vercel DATABASE_URL과 .env를 동일하게");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
