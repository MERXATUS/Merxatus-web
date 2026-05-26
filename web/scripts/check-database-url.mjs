/**
 * DATABASE_URL 형식 진단 (비밀번호는 출력하지 않음)
 *   node scripts/check-database-url.mjs
 */
import fs from "node:fs";
import path from "node:path";

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
if (!fs.existsSync(envPath)) {
  console.error(".env 없음");
  process.exit(1);
}

const text = fs.readFileSync(envPath, "utf8");
const raw = parseLine(text, "DATABASE_URL");
if (!raw) {
  console.error("DATABASE_URL 없음");
  process.exit(1);
}

console.log("=== DATABASE_URL 진단 (.env) ===\n");

if (raw.includes("file:")) {
  console.log("유형: SQLite (로컬 file) — Supabase가 아님");
  process.exit(0);
}

try {
  const normalized = raw.replace(/^postgresql:/, "postgres:");
  const u = new URL(normalized);
  const user = decodeURIComponent(u.username);
  const host = u.hostname;
  const port = u.port || "5432";
  const db = u.pathname.replace(/^\//, "");
  const pwdLen = u.password ? decodeURIComponent(u.password).length : 0;

  console.log("user:", user);
  console.log("host:", host);
  console.log("port:", port);
  console.log("database:", db);
  console.log("password 길이:", pwdLen, pwdLen === 0 ? "(비어 있음!)" : "");
  console.log("pgbouncer:", raw.includes("pgbouncer=true") ? "yes" : "no");
  console.log("connection_limit:", raw.match(/connection_limit=(\d+)/)?.[1] ?? "(없음)");

  const issues = [];
  if (host.includes("pooler.supabase.com")) {
    if (!user.startsWith("postgres.")) {
      issues.push("Pooler URL인데 user가 postgres.xxxxx 형식이 아닙니다.");
    }
    if (port === "5432") {
      issues.push("Session pooler(5432) — Prisma/Vercel은 6543 Transaction pooler 사용");
    }
    if (port === "5432" && raw.includes("pgbouncer=true")) {
      issues.push("5432 + pgbouncer=true 조합 오류 → prepared statement already exists 유발. 6543으로 바꾸세요.");
    }
    if (port === "6543" && !raw.includes("pgbouncer=true")) {
      issues.push("6543 Transaction pooler — ?pgbouncer=true 필수");
    }
    if (!raw.includes("pgbouncer=true") && host.includes("pooler.supabase.com")) {
      issues.push("pooler 사용 시 ?pgbouncer=true&connection_limit=1 권장");
    }
  } else if (host.includes("db.") && host.includes(".supabase.co")) {
    issues.push("Direct URL(db.xxx.supabase.co)입니다. Vercel 런타임용 pooler(6543)와 user 형식이 다릅니다.");
    if (user === "postgres" && port === "5432") {
      issues.push("마이그레이션용 Direct는 OK. Vercel DATABASE_URL에는 pooler URI를 쓰세요.");
    }
  }

  if (pwdLen === 0) issues.push("비밀번호가 URL에 없습니다.");
  if (/\s/.test(decodeURIComponent(u.password || ""))) issues.push("비밀번호에 공백이 있습니다.");

  if (issues.length) {
    console.log("\n⚠ 문제 가능:");
    for (const i of issues) console.log(" -", i);
  } else {
    console.log("\n✓ 형식은 Supabase Transaction pooler 기준으로 OK");
  }

  console.log("\n다음: node scripts/test-database-connection.mjs 로 실제 연결 테스트");
} catch (e) {
  console.error("URL 파싱 실패:", e.message);
  console.error("앞 40자:", raw.slice(0, 40) + "...");
  process.exit(1);
}
